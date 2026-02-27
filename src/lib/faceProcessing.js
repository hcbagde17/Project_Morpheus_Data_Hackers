import * as ort from 'onnxruntime-web';
import { getModels } from './aiModelLoader';

/**
 * faceProcessing.js v2.0 — ArcFace Pipeline
 *
 * Pipeline:
 *   detectFaces(video)      → [{ bbox, landmarks5, score }]
 *   alignFace(video, lm5)   → canvas112x112
 *   extractEmbedding(canvas) → Float32Array(512)
 *   checkLiveness(canvas)   → spoofProbability (0-1)
 *   cosineSimilarity(a, b)  → -1..1
 *   computeCentroid(embeds)  → Float32Array(512)
 *
 * Models (loaded via aiModelLoader.js):
 *   det_10g.onnx       – SCRFD-10G  (face detection)
 *   w600k_r50.onnx     – ArcFace R50 (512D embedding)
 *   MiniFASNetV2.onnx  – Anti-spoof  (liveness)
 */

// Standard ArcFace alignment reference landmarks (112×112)
const REFERENCE_LANDMARKS = [
    [38.29, 51.70],  // left eye
    [73.53, 51.50],  // right eye
    [56.02, 71.73],  // nose tip
    [41.55, 92.37],  // left mouth
    [70.73, 92.20],  // right mouth
];

// ─── DETECTION ───────────────────────────────────────────────────────────────

/**
 * Detect faces using SCRFD-10G
 * @param {HTMLVideoElement|HTMLCanvasElement} input
 * @returns {Promise<Array<{bbox: number[], landmarks: number[][], score: number}>>}
 */
export const detectFaces = async (input) => {
    const { detector } = getModels();
    if (!detector) throw new Error('Detector model not loaded');

    const DET_SIZE = 640;
    const canvas = document.createElement('canvas');
    canvas.width = DET_SIZE;
    canvas.height = DET_SIZE;
    const ctx = canvas.getContext('2d');

    // Letterbox the input to 640×640
    const w = input.videoWidth || input.width;
    const h = input.videoHeight || input.height;
    const scale = Math.min(DET_SIZE / w, DET_SIZE / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    const dx = Math.round((DET_SIZE - nw) / 2);
    const dy = Math.round((DET_SIZE - nh) / 2);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, DET_SIZE, DET_SIZE);
    ctx.drawImage(input, dx, dy, nw, nh);

    const imageData = ctx.getImageData(0, 0, DET_SIZE, DET_SIZE);
    const tensor = new Float32Array(3 * DET_SIZE * DET_SIZE);
    const data = imageData.data;

    for (let i = 0; i < DET_SIZE * DET_SIZE; i++) {
        tensor[i] = (data[i * 4 + 2] - 127.5) / 128;   // B (BGR order)
        tensor[i + DET_SIZE * DET_SIZE] = (data[i * 4 + 1] - 127.5) / 128;     // G
        tensor[i + DET_SIZE * DET_SIZE * 2] = (data[i * 4] - 127.5) / 128;     // R
    }

    const inputTensor = new ort.Tensor('float32', tensor, [1, 3, DET_SIZE, DET_SIZE]);
    const inputName = detector.inputNames[0];
    const results = await detector.run({ [inputName]: inputTensor });

    // Dynamic output mapping by shape
    const outputs = Object.entries(results).map(([name, t]) => ({
        name, data: t.data, dims: t.dims
    }));

    // One-time debug log
    if (!detectFaces._logged) {
        detectFaces._logged = true;
        console.log('[SCRFD] Output tensors:', outputs.map(o =>
            `${o.name}: shape=[${o.dims}] sample=${Array.from(o.data.slice(0, 3)).map(v => v.toFixed(4))}`
        ));
    }

    // Classify outputs by last dimension
    const scoreOutputs = outputs.filter(o => o.dims[o.dims.length - 1] === 1);
    const bboxOutputs = outputs.filter(o => o.dims[o.dims.length - 1] === 4);
    const kpsOutputs = outputs.filter(o => o.dims[o.dims.length - 1] === 10);

    // Sort by element count (ascending = stride 8, 16, 32)
    scoreOutputs.sort((a, b) => b.data.length - a.data.length);
    bboxOutputs.sort((a, b) => b.data.length - a.data.length);
    kpsOutputs.sort((a, b) => b.data.length - a.data.length);

    const strides = [8, 16, 32];
    const CONF_THRESH = 0.5;
    const detections = [];

    // Auto-detect sigmoid need: check if scores are logits or probabilities
    let needsSigmoid = false;
    if (scoreOutputs.length > 0) {
        const sampleScores = scoreOutputs[0].data.slice(0, 100);
        for (let i = 0; i < sampleScores.length; i++) {
            if (sampleScores[i] < 0 || sampleScores[i] > 1) {
                needsSigmoid = true;
                break;
            }
        }
    }

    for (let si = 0; si < strides.length && si < scoreOutputs.length; si++) {
        const stride = strides[si];
        const scores = scoreOutputs[si].data;
        const bboxes = bboxOutputs[si]?.data;
        const kps = kpsOutputs[si]?.data;
        const gridW = Math.ceil(DET_SIZE / stride);
        const gridH = Math.ceil(DET_SIZE / stride);

        for (let idx = 0; idx < scores.length; idx++) {
            let score = scores[idx];
            if (needsSigmoid) score = 1 / (1 + Math.exp(-score));
            if (score < CONF_THRESH) continue;

            const row = Math.floor(idx / gridW);
            const col = idx % gridW;
            const cx = (col + 0.5) * stride;
            const cy = (row + 0.5) * stride;

            if (bboxes) {
                const bi = idx * 4;
                const x1 = cx - bboxes[bi] * stride;
                const y1 = cy - bboxes[bi + 1] * stride;
                const x2 = cx + bboxes[bi + 2] * stride;
                const y2 = cy + bboxes[bi + 3] * stride;

                const landmarks = [];
                if (kps) {
                    const ki = idx * 10;
                    for (let p = 0; p < 5; p++) {
                        landmarks.push([
                            cx + kps[ki + p * 2] * stride,
                            cy + kps[ki + p * 2 + 1] * stride
                        ]);
                    }
                }

                // Map back from letterboxed coords to original
                detections.push({
                    bbox: [
                        (x1 - dx) / scale,
                        (y1 - dy) / scale,
                        (x2 - dx) / scale,
                        (y2 - dy) / scale
                    ],
                    landmarks: landmarks.map(([lx, ly]) => [
                        (lx - dx) / scale,
                        (ly - dy) / scale
                    ]),
                    score
                });
            }
        }
    }

    return nms(detections, 0.4);
};

// ─── ALIGNMENT ───────────────────────────────────────────────────────────────

/**
 * Align a face crop to 112×112 using 5-point affine transform (ArcFace standard)
 * @param {HTMLVideoElement|HTMLCanvasElement} source
 * @param {number[][]} landmarks5  [[lx,ly], [rx,ry], [nx,ny], [lm,lm], [rm,rm]]
 * @returns {HTMLCanvasElement} 112×112 aligned face
 */
export const alignFace = (source, landmarks5) => {
    const canvas = document.createElement('canvas');
    canvas.width = 112;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');

    const [a, b, tx, c, d, ty] = getAffineTransform(landmarks5, REFERENCE_LANDMARKS);
    ctx.setTransform(a, c, b, d, tx, ty);
    ctx.drawImage(source, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    return canvas;
};

// ─── EMBEDDING ───────────────────────────────────────────────────────────────

/**
 * Extract 512D ArcFace embedding from a 112×112 aligned face canvas
 * @param {HTMLCanvasElement} alignedCanvas
 * @returns {Promise<Float32Array>} L2-normalized 512D embedding
 */
export const extractEmbedding = async (alignedCanvas) => {
    const { recognizer } = getModels();
    if (!recognizer) throw new Error('Recognizer model not loaded');

    const ctx = alignedCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 112, 112);
    const data = imageData.data;
    const tensor = new Float32Array(3 * 112 * 112);

    // ArcFace normalization: (pixel / 255 - 0.5) / 0.5 = pixel / 127.5 - 1
    for (let i = 0; i < 112 * 112; i++) {
        tensor[i] = (data[i * 4 + 2] / 127.5) - 1;   // B
        tensor[i + 112 * 112] = (data[i * 4 + 1] / 127.5) - 1;     // G
        tensor[i + 112 * 112 * 2] = (data[i * 4] / 127.5) - 1;     // R
    }

    const t = new ort.Tensor('float32', tensor, [1, 3, 112, 112]);
    const inputName = recognizer.inputNames[0];
    const result = await recognizer.run({ [inputName]: t });
    const raw = result[Object.keys(result)[0]].data;
    return l2Normalize(raw);
};

// ─── ANTI-SPOOF ──────────────────────────────────────────────────────────────

/**
 * Run MiniFASNetV2 liveness check
 * @param {HTMLCanvasElement} alignedCanvas  112×112 face
 * @returns {Promise<number>} spoof probability (0 = live, 1 = spoof)
 */
export const checkLiveness = async (alignedCanvas) => {
    const { antiSpoof } = getModels();
    if (!antiSpoof) throw new Error('AntiSpoof model not loaded');

    // Resize 112→80
    const canvas80 = document.createElement('canvas');
    canvas80.width = 80;
    canvas80.height = 80;
    const ctx80 = canvas80.getContext('2d');
    ctx80.drawImage(alignedCanvas, 0, 0, 80, 80);

    const imageData = ctx80.getImageData(0, 0, 80, 80);
    const data = imageData.data;
    const tensor = new Float32Array(3 * 80 * 80);

    // ImageNet normalization
    for (let i = 0; i < 80 * 80; i++) {
        tensor[i] = (data[i * 4] / 255 - 0.485) / 0.229;     // R
        tensor[i + 80 * 80] = (data[i * 4 + 1] / 255 - 0.456) / 0.224; // G
        tensor[i + 80 * 80 * 2] = (data[i * 4 + 2] / 255 - 0.406) / 0.225; // B
    }

    const t = new ort.Tensor('float32', tensor, [1, 3, 80, 80]);
    const inputName = antiSpoof.inputNames[0];
    const result = await antiSpoof.run({ [inputName]: t });
    const logits = result[Object.keys(result)[0]].data;

    // Debug log on first call
    if (!checkLiveness._logged) {
        checkLiveness._logged = true;
        console.log('[AntiSpoof] Output logits:', Array.from(logits).map(v => v.toFixed(4)),
            'outputNames:', antiSpoof.outputNames,
            'numOutputs:', logits.length);
    }

    // MiniFASNetV2 from yakhyo/face-anti-spoofing outputs [spoof, real]
    // We return spoof probability (0 → live, 1 → spoof)
    const expSpoof = Math.exp(logits[0]);
    const expReal = Math.exp(logits[1]);
    return expSpoof / (expSpoof + expReal);
};

// ─── SIMILARITY ──────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two L2-normalized embeddings
 * @returns {number} -1.0 to 1.0 (higher = more similar)
 */
export const calculateSimilarity = (v1, v2) => {
    if (!v1 || !v2 || v1.length !== v2.length) return 0;
    let dot = 0;
    for (let i = 0; i < v1.length; i++) dot += v1[i] * v2[i];
    return Math.max(-1, Math.min(1, dot)); // Already L2-normalized, dot = cosine
};
// Alias for clarity in new code
export const cosineSimilarity = calculateSimilarity;

/**
 * Compute centroid of multiple embeddings (mean + L2-normalize)
 * @param {Float32Array[]} embeddings
 * @returns {Float32Array} 512D centroid
 */
export const computeCentroid = (embeddings) => {
    if (!embeddings || embeddings.length === 0) return null;
    const dim = embeddings[0].length;
    const sum = new Float32Array(dim);
    for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) sum[i] += emb[i];
    }
    return l2Normalize(sum);
};

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function imageToTensor(imageData, mean, std) {
    const { data, width, height } = imageData;
    const tensor = new Float32Array(3 * width * height);
    for (let i = 0; i < width * height; i++) {
        tensor[i] = (data[i * 4] / 255 - mean[0]) / std[0];
        tensor[i + width * height] = (data[i * 4 + 1] / 255 - mean[1]) / std[1];
        tensor[i + width * height * 2] = (data[i * 4 + 2] / 255 - mean[2]) / std[2];
    }
    return tensor;
}

function l2Normalize(v) {
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return v;
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
    return out;
}

function nms(dets, iouThreshold) {
    if (dets.length === 0) return [];
    dets.sort((a, b) => b.score - a.score);
    const keep = [];
    const suppressed = new Set();
    for (let i = 0; i < dets.length; i++) {
        if (suppressed.has(i)) continue;
        keep.push(dets[i]);
        for (let j = i + 1; j < dets.length; j++) {
            if (suppressed.has(j)) continue;
            if (iou(dets[i].bbox, dets[j].bbox) > iouThreshold) {
                suppressed.add(j);
            }
        }
    }
    return keep;
}

function iou(a, b) {
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[2], b[2]);
    const y2 = Math.min(a[3], b[3]);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = (a[2] - a[0]) * (a[3] - a[1]);
    const areaB = (b[2] - b[0]) * (b[3] - b[1]);
    return inter / (areaA + areaB - inter + 1e-6);
}

/**
 * Estimate 2D affine matrix from 5-pt landmarks to reference
 * Returns [a, b, tx, c, d, ty] for ctx.transform(a,c,b,d,tx,ty)
 */
function getAffineTransform(src, dst) {
    // Least-squares solution for 2D affine (6 params) from N point correspondences
    const n = src.length;
    const A = [];
    const bx = [];
    const by = [];

    for (let i = 0; i < n; i++) {
        A.push([src[i][0], src[i][1], 1]);
        bx.push(dst[i][0]);
        by.push(dst[i][1]);
    }

    // Solve Ax = bx and Ay = by using normal equations: (A^T A)^-1 A^T b
    const solveLS = (A, b) => {
        const m = A[0].length;
        const AtA = Array.from({ length: m }, () => new Float64Array(m));
        const Atb = new Float64Array(m);

        for (let i = 0; i < A.length; i++) {
            for (let j = 0; j < m; j++) {
                Atb[j] += A[i][j] * b[i];
                for (let k = 0; k < m; k++) {
                    AtA[j][k] += A[i][j] * A[i][k];
                }
            }
        }

        // Gaussian elimination
        for (let col = 0; col < m; col++) {
            let maxRow = col;
            for (let row = col + 1; row < m; row++) {
                if (Math.abs(AtA[row][col]) > Math.abs(AtA[maxRow][col])) maxRow = row;
            }
            [AtA[col], AtA[maxRow]] = [AtA[maxRow], AtA[col]];
            [Atb[col], Atb[maxRow]] = [Atb[maxRow], Atb[col]];

            for (let row = col + 1; row < m; row++) {
                const f = AtA[row][col] / AtA[col][col];
                for (let k = col; k < m; k++) AtA[row][k] -= f * AtA[col][k];
                Atb[row] -= f * Atb[col];
            }
        }

        const x = new Float64Array(m);
        for (let i = m - 1; i >= 0; i--) {
            x[i] = Atb[i];
            for (let j = i + 1; j < m; j++) x[i] -= AtA[i][j] * x[j];
            x[i] /= AtA[i][i];
        }
        return x;
    };

    const [a, b, tx] = solveLS(A, bx);
    const [c, d, ty] = solveLS(A, by);

    return [a, b, tx, c, d, ty];
}

import * as faceapi from 'face-api.js';

/**
 * Detect faces in an image/video element using face-api.js
 * @param {HTMLImageElement | HTMLVideoElement | HTMLCanvasElement} input 
 * @returns {Promise<Array>} Array of { bbox, landmarks, score }
 */
export const detectFaces = async (input) => {
    const detections = await faceapi
        .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks();

    return detections.map(d => {
        const box = d.detection.box;
        // Extract the 5-point landmarks that match the standard alignment points
        // face-api.js gives 68 points; pick: left eye center, right eye center, nose tip, left mouth, right mouth
        const pts = d.landmarks.positions;
        const leftEye = averagePoint(pts.slice(36, 42));   // left eye
        const rightEye = averagePoint(pts.slice(42, 48));  // right eye
        const noseTip = pts[30];                            // nose tip
        const leftMouth = pts[48];                          // left mouth corner
        const rightMouth = pts[54];                         // right mouth corner

        return {
            bbox: [box.x, box.y, box.x + box.width, box.y + box.height],
            landmarks: [
                [leftEye.x, leftEye.y],
                [rightEye.x, rightEye.y],
                [noseTip.x, noseTip.y],
                [leftMouth.x, leftMouth.y],
                [rightMouth.x, rightMouth.y],
            ],
            score: d.detection.score,
        };
    });
};

/**
 * Extract a 128-dim face embedding (descriptor)
 * @param {HTMLImageElement | HTMLVideoElement | HTMLCanvasElement} input 
 * @returns {Promise<Float32Array>} 128-dim embedding
 */
export const extractEmbedding = async (input) => {
    const result = await faceapi
        .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!result) throw new Error('No face detected for embedding extraction');
    return result.descriptor; // Float32Array[128]
};

/**
 * Calculate Cosine Similarity between two embeddings
 * @param {Float32Array|Array} v1 
 * @param {Float32Array|Array} v2 
 * @returns {number} Score -1.0 to 1.0
 */
export const calculateSimilarity = (v1, v2) => {
    if (v1.length !== v2.length) return 0;
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        norm1 += v1[i] * v1[i];
        norm2 += v2[i] * v2[i];
    }
    return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
};

// Helper: average a set of {x,y} points
function averagePoint(points) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

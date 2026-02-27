import * as ort from 'onnxruntime-web';

/**
 * aiModelLoader.js — ONNX Runtime Model Loader
 *
 * Loads three ONNX models for the ArcFace facial recognition pipeline:
 *   - det_10g.onnx     → SCRFD-10G face detector
 *   - w600k_r50.onnx   → ArcFace R50 512D face embeddings
 *   - MiniFASNetV2.onnx → Anti-spoof liveness check
 *
 * In a packaged Electron app, models are loaded via the 'load-model' IPC channel
 * which decrypts the corresponding .onnx.enc file in the main process and returns
 * the raw bytes as an ArrayBuffer — they never touch disk in plaintext.
 *
 * In a plain browser/web environment (no electronAPI), models are fetched from
 * the public/models/arcface/ directory as a fallback (dev/test only).
 *
 * WASM runtime files are served locally from public/ (version-matched to the
 * installed onnxruntime-web npm package) to avoid CDN version mismatches.
 */

const MODELS = {
    detector: null,
    recognizer: null,
    antiSpoof: null,
};

let loaded = false;

/**
 * Load one ONNX model.
 * Prefers the secure IPC path (Electron); falls back to HTTP fetch in web/dev.
 *
 * @param {string} modelName  friendly name for IPC ('det_10g' | 'w600k_r50' | 'MiniFASNetV2')
 * @param {string} publicPath fallback URL  e.g. '/models/arcface/det_10g.onnx'
 * @param {object} opts       ort.InferenceSession options
 */
async function loadOneModel(modelName, publicPath, opts) {
    // ── Electron path: decrypt in main process, load from ArrayBuffer ──
    if (typeof window !== 'undefined' && window.electronAPI?.loadModel) {
        try {
            const buffer = await window.electronAPI.loadModel(modelName);
            // buffer is an ArrayBuffer (Electron serialises node Buffer → ArrayBuffer)
            return await ort.InferenceSession.create(buffer, opts);
        } catch (err) {
            console.warn(`[AI] IPC model load failed for ${modelName}, falling back to HTTP: ${err.message}`);
        }
    }

    // ── Web / fallback path: load via HTTP (plain .onnx, dev only) ──
    console.warn(`[AI] ⚠  Loading ${modelName} via HTTP public path (unencrypted — dev/test only)`);
    return await ort.InferenceSession.create(publicPath, opts);
}

export const loadAIModels = async () => {
    if (loaded) return;

    // Serve WASM from public/ via Vite dev server (version-matched to npm package)
    ort.env.wasm.wasmPaths = '/';
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;

    console.log('[AI] Loading ONNX models (encrypted IPC path preferred)...');

    const opts = { executionProviders: ['wasm'] };

    const [detector, recognizer, antiSpoof] = await Promise.all([
        loadOneModel('det_10g', '/models/arcface/det_10g.onnx', opts),
        loadOneModel('w600k_r50', '/models/arcface/w600k_r50.onnx', opts),
        loadOneModel('MiniFASNetV2', '/models/arcface/MiniFASNetV2.onnx', opts),
    ]);

    MODELS.detector = detector;
    MODELS.recognizer = recognizer;
    MODELS.antiSpoof = antiSpoof;
    loaded = true;

    console.log('[AI] ✅ All 3 ONNX models loaded successfully');
    console.log('[AI]   Detector inputs:', detector.inputNames, '→ outputs:', detector.outputNames);
    console.log('[AI]   Recognizer inputs:', recognizer.inputNames, '→ outputs:', recognizer.outputNames);
    console.log('[AI]   AntiSpoof inputs:', antiSpoof.inputNames, '→ outputs:', antiSpoof.outputNames);
};

export const getModels = () => MODELS;

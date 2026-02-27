import * as ort from 'onnxruntime-web';

/**
 * aiModelLoader.js — ONNX Runtime Model Loader
 *
 * Loads three ONNX models for the ArcFace facial recognition pipeline:
 *   - det_10g.onnx     → SCRFD-10G face detector
 *   - w600k_r50.onnx   → ArcFace R50 512D face embeddings
 *   - MiniFASNetV2.onnx → Anti-spoof liveness check
 *
 * WASM runtime files are loaded from CDN to avoid Vite bundling conflicts.
 * Model .onnx files are served locally from public/models/arcface/.
 */

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

const MODELS = {
    detector: null,
    recognizer: null,
    antiSpoof: null,
};

let loaded = false;

export const loadAIModels = async () => {
    if (loaded) return;

    // Configure ONNX Runtime to use CDN for WASM files
    ort.env.wasm.wasmPaths = CDN_BASE;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;

    console.log('[AI] Loading ONNX models via CDN WASM runtime...');

    const opts = { executionProviders: ['wasm'] };

    const [detector, recognizer, antiSpoof] = await Promise.all([
        ort.InferenceSession.create('/models/arcface/det_10g.onnx', opts),
        ort.InferenceSession.create('/models/arcface/w600k_r50.onnx', opts),
        ort.InferenceSession.create('/models/arcface/MiniFASNetV2.onnx', opts),
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

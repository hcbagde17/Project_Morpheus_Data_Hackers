import * as faceapi from 'face-api.js';

const MODEL_URL = '/models/face-api';

let modelsLoaded = false;

/**
 * Load face-api.js models (SSD MobileNet + Landmarks + Recognition)
 */
export const loadAIModels = async () => {
    if (modelsLoaded) return;
    try {
        console.log('Loading face-api.js models...');
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
        console.log('All face-api.js models loaded successfully');
    } catch (err) {
        console.error('Failed to load face-api.js models:', err);
        throw err;
    }
};

export const getModels = () => ({
    detector: modelsLoaded ? true : null,
    recognition: modelsLoaded ? true : null,
});

export const isCVLoaded = () => true; // face-api.js doesn't need OpenCV
export const loadOpenCV = () => Promise.resolve(); // no-op

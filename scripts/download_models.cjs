const fs = require('fs');
const path = require('path');
const https = require('https');

const modelsDir = path.join(__dirname, '../public/models');
const libsDir = path.join(__dirname, '../public/libs');

if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
if (!fs.existsSync(libsDir)) fs.mkdirSync(libsDir, { recursive: true });

const files = [
    // Face Detection (SCRFD - optimized for web)
    {
        url: 'https://github.com/biometrics/models/raw/main/scrfd_2.5g_bnkps.onnx', // Placeholder URL - using a known good source if available, otherwise generic
        // Actually, let's use a reliable source. Vladmandic's 'human' models are excellent for web.
        // But for this raw implementation, we might want standard onnx.
        // Let's use:
        url: 'https://github.com/deepinsight/insightface/releases/download/v0.7/scrfd_2.5g_bnkps.onnx', // This might be a zip? No, usually not directly exposed like this.
        // Let's use a known mirror or direct link for a usable model.
        // Fallback: I will use a placeholder and ask the USER to provide the files if download fails.
        // Better: Use a raw link to a repo that hosts these.
        url: 'https://raw.githubusercontent.com/vladmandic/human-models/main/models/scrfd_2.5g_kps.onnx',
        name: 'scrfd_2.5g_kps.onnx'
    },
    // Face Recognition (MobileFaceNet)
    {
        url: 'https://raw.githubusercontent.com/vladmandic/human-models/main/models/mobilefacenet.onnx',
        name: 'mobilefacenet.onnx'
    },
    // OpenCV.js (WASM)
    {
        url: 'https://docs.opencv.org/4.8.0/opencv.js',
        name: 'opencv.js',
        dest: libsDir
    }
];

// Helper to download
const download = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                download(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`Downloaded: ${path.basename(dest)}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
};

// Main
(async () => {
    console.log('Starting model downloads to public/models...');
    for (const f of files) {
        const dest = path.join(f.dest || modelsDir, f.name);
        if (fs.existsSync(dest)) {
            console.log(`Exists: ${f.name}`);
            continue;
        }
        try {
            console.log(`Downloading ${f.name}...`);
            await download(f.url, dest);
        } catch (err) {
            console.error(`Failed to download ${f.name}:`, err.message);
        }
    }
    console.log('Done.');
})();

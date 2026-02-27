'use strict';
/**
 * electron/services/modelLoader.cjs
 *
 * Runtime decrypt-on-load for encrypted ONNX model files.
 *
 * Called from main.cjs IPC handler 'load-model'.
 * Returns a Node.js Buffer (which Electron serialises to an ArrayBuffer on the
 * renderer side) containing the raw ONNX bytes — never written to disk.
 *
 * File format expected:
 *   [0..15]   = 16-byte IV
 *   [16..31]  = 16-byte GCM auth tag
 *   [32..]    = AES-256-GCM ciphertext
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ─── Derive per-model key with HKDF-SHA256 ───────────────────────────────────
function deriveKey(masterSecret, modelFileName) {
    return new Promise((resolve, reject) => {
        const info = Buffer.from(modelFileName, 'utf8');
        crypto.hkdf('sha256', masterSecret, Buffer.alloc(0), info, 32, (err, key) => {
            if (err) return reject(err);
            resolve(Buffer.from(key));
        });
    });
}

// ─── Map friendly name → encrypted file path ─────────────────────────────────
const MODEL_FILE_MAP = {
    'det_10g': 'det_10g.onnx',
    'w600k_r50': 'w600k_r50.onnx',
    'MiniFASNetV2': 'MiniFASNetV2.onnx',
};

/**
 * loadModel(modelName) → Buffer
 *
 * @param {string} modelName  - one of: 'det_10g', 'w600k_r50', 'MiniFASNetV2'
 * @returns {Promise<Buffer>} decrypted ONNX bytes (in-memory only)
 */
async function loadModel(modelName) {
    const masterSecretHex = process.env.MODEL_MASTER_SECRET;
    if (!masterSecretHex) {
        throw new Error('[modelLoader] MODEL_MASTER_SECRET is not set in environment.');
    }
    const masterSecret = Buffer.from(masterSecretHex, 'hex');
    if (masterSecret.length !== 32) {
        throw new Error('[modelLoader] MODEL_MASTER_SECRET must be 64 hex characters.');
    }

    const modelFileName = MODEL_FILE_MAP[modelName];
    if (!modelFileName) {
        throw new Error(`[modelLoader] Unknown model name: "${modelName}". Valid: ${Object.keys(MODEL_FILE_MAP).join(', ')}`);
    }

    // Resolve path: in packaged app use app.getAppPath(), in dev use __dirname
    const { app } = require('electron');
    const appRoot = app.isPackaged
        ? path.join(app.getAppPath(), '..', 'resources')  // electron-builder copies public/ to resources/
        : path.join(__dirname, '..', '..', 'public');

    const encPath = path.join(appRoot, 'models', 'arcface', modelFileName + '.enc');

    if (!fs.existsSync(encPath)) {
        // Graceful degradation: if .enc doesn't exist, try plain .onnx (dev mode)
        const plainPath = path.join(appRoot, 'models', 'arcface', modelFileName);
        if (fs.existsSync(plainPath)) {
            console.warn(`[modelLoader] ⚠  Loading unencrypted model: ${modelFileName} (run scripts/encryptModels.cjs to encrypt)`);
            return fs.readFileSync(plainPath);
        }
        throw new Error(`[modelLoader] Model file not found: ${encPath}`);
    }

    const blob = fs.readFileSync(encPath);

    // Parse layout: [IV 16B][authTag 16B][ciphertext]
    const iv = blob.subarray(0, 16);
    const authTag = blob.subarray(16, 32);
    const ct = blob.subarray(32);

    const key = await deriveKey(masterSecret, modelFileName);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted;
    try {
        const d1 = decipher.update(ct);
        const d2 = decipher.final();
        decrypted = Buffer.concat([d1, d2]);
    } catch (err) {
        throw new Error(`[modelLoader] Decryption failed for ${modelFileName} — file may be tampered: ${err.message}`);
    }

    console.log(`[modelLoader] ✅ ${modelFileName} decrypted (${(decrypted.length / 1024 / 1024).toFixed(1)} MB)`);
    return decrypted;
}

module.exports = { loadModel };

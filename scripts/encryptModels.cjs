#!/usr/bin/env node
/**
 * scripts/encryptModels.cjs
 *
 * One-time build-time script: encrypts the 3 ArcFace ONNX model files
 * using AES-256-GCM with per-model HKDF-derived keys.
 *
 * Usage:
 *   1. Set MODEL_MASTER_SECRET in your .env (64 hex chars = 32 bytes)
 *   2. Run: node scripts/encryptModels.cjs
 *   3. Verify *.onnx.enc files were created in public/models/arcface/
 *   4. Optionally delete the plain *.onnx files (keep a secure backup!)
 *
 * File format written:
 *   [0..15]   = 16-byte random IV
 *   [16..31]  = 16-byte GCM auth tag
 *   [32..]    = AES-256-GCM ciphertext
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ─── Master secret ────────────────────────────────────────────────────────────
const masterSecretHex = process.env.MODEL_MASTER_SECRET;
if (!masterSecretHex || masterSecretHex === 'change_this_to_a_64_char_hex_secret_before_shipping') {
    console.error('\n[encryptModels] ❌  MODEL_MASTER_SECRET is not set or is still the placeholder.');
    console.error('   Generate one with:');
    console.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.error('   Then paste it as MODEL_MASTER_SECRET in your .env file.\n');
    process.exit(1);
}
const masterSecret = Buffer.from(masterSecretHex, 'hex');
if (masterSecret.length !== 32) {
    console.error('[encryptModels] ❌ MODEL_MASTER_SECRET must be exactly 64 hex characters (32 bytes).');
    process.exit(1);
}

// ─── Model targets ───────────────────────────────────────────────────────────
const MODEL_DIR = path.join(__dirname, '..', 'public', 'models', 'arcface');
const MODELS = ['det_10g.onnx', 'w600k_r50.onnx', 'MiniFASNetV2.onnx'];

// ─── Key derivation via HKDF-SHA256 ──────────────────────────────────────────
function deriveKey(modelName) {
    return new Promise((resolve, reject) => {
        // info = ASCII bytes of the model name
        const info = Buffer.from(modelName, 'utf8');
        crypto.hkdf('sha256', masterSecret, Buffer.alloc(0), info, 32, (err, key) => {
            if (err) return reject(err);
            resolve(Buffer.from(key));
        });
    });
}

// ─── Encrypt one file ────────────────────────────────────────────────────────
async function encryptModel(modelFileName) {
    const srcPath = path.join(MODEL_DIR, modelFileName);
    const destPath = srcPath + '.enc';

    if (!fs.existsSync(srcPath)) {
        console.warn(`  [skip] ${modelFileName} — file not found at: ${srcPath}`);
        return;
    }

    const plaintext = fs.readFileSync(srcPath);
    const key = await deriveKey(modelFileName);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct1 = cipher.update(plaintext);
    const ct2 = cipher.final();
    const authTag = cipher.getAuthTag(); // 16 bytes

    // Layout: [IV 16B][authTag 16B][ciphertext]
    const output = Buffer.concat([iv, authTag, ct1, ct2]);
    fs.writeFileSync(destPath, output);

    const sizeMB = (plaintext.length / 1024 / 1024).toFixed(1);
    console.log(`  ✅ ${modelFileName} (${sizeMB} MB) → ${path.basename(destPath)}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\n[encryptModels] Encrypting ONNX models with AES-256-GCM...\n');
    for (const model of MODELS) {
        await encryptModel(model);
    }
    console.log('\n[encryptModels] Done.');
    console.log('[encryptModels] ⚠  Keep the .onnx originals in a secure offline backup.');
    console.log('[encryptModels] ⚠  Do NOT commit MODEL_MASTER_SECRET to git.\n');
})();

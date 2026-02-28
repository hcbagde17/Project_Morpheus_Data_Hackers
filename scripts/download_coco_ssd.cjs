/**
 * download_coco_ssd.cjs
 *
 * Downloads the COCO-SSD MobileNet v2 TensorFlow.js model weights from
 * Google Cloud Storage and saves them to public/models/coco-ssd/
 * so the model loads entirely offline during exams.
 *
 * Run once with:  node scripts/download_coco_ssd.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssd_mobilenet_v2/';
const OUTPUT_DIR = path.join(__dirname, '../public/models/coco-ssd');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}`);
}

// ─── Download helper (follows redirects) ────────────────────────────────────
const download = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlink(dest, () => { });
                download(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(dest, () => { });
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                const size = fs.statSync(dest).size;
                console.log(`  ✔ ${path.basename(dest)} (${(size / 1024).toFixed(1)} KB)`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
};

// ─── Fetch model.json and derive weight shard filenames ─────────────────────
const fetchJSON = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                fetchJSON(res.headers.location).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
};

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\n🔽 Downloading COCO-SSD MobileNet v2 model for local offline use...');
    console.log(`   Source : ${BASE_URL}`);
    console.log(`   Dest   : ${OUTPUT_DIR}\n`);

    // 1. Download model.json
    const modelJsonDest = path.join(OUTPUT_DIR, 'model.json');
    if (!fs.existsSync(modelJsonDest)) {
        console.log('Downloading model.json...');
        await download(BASE_URL + 'model.json', modelJsonDest);
    } else {
        console.log('  ⏭  model.json already exists, skipping.');
    }

    // 2. Parse model.json to get weight shard filenames
    const modelJson = JSON.parse(fs.readFileSync(modelJsonDest, 'utf8'));
    const weightFiles = [];

    // TF.js savedmodel format stores weights under weightsManifest
    if (modelJson.weightsManifest) {
        for (const group of modelJson.weightsManifest) {
            for (const p of group.paths) {
                weightFiles.push(p);
            }
        }
    }
    // Also check modelTopology for any format variants
    if (modelJson.modelTopology && modelJson.modelTopology.weightsManifest) {
        for (const group of modelJson.modelTopology.weightsManifest) {
            for (const p of group.paths) {
                if (!weightFiles.includes(p)) weightFiles.push(p);
            }
        }
    }

    if (weightFiles.length === 0) {
        console.warn('⚠  No weight shard paths found in model.json. Inspect the file manually.');
    } else {
        console.log(`\nFound ${weightFiles.length} weight shard(s) to download:`);
        for (const shard of weightFiles) {
            const dest = path.join(OUTPUT_DIR, shard);
            if (fs.existsSync(dest)) {
                console.log(`  ⏭  ${shard} already exists, skipping.`);
                continue;
            }
            // Ensure sub-directory exists (some models nest shards)
            const shardDir = path.dirname(dest);
            if (!fs.existsSync(shardDir)) fs.mkdirSync(shardDir, { recursive: true });
            await download(BASE_URL + shard, dest);
        }
    }

    console.log('\n✅ Done! COCO-SSD model is now bundled locally.');
    console.log('   TF.js will load it from: /models/coco-ssd/model.json\n');
})().catch(err => {
    console.error('\n❌ Download failed:', err.message);
    process.exit(1);
});

# SecurityHardening — Encryption Details

> Companion to `SecurityHardening.md`. Specifies the exact encryption algorithm, parameters, and rationale for each hardening section.

---

## §3 — Memory Protection

### In-memory Face Embedding Cache

| Field | Value |
|---|---|
| **Data** | `Float32Array` face embedding during & after comparison |
| **Algorithm** | **AES-256-GCM** (if any temporary caching is needed) |
| **Key storage** | Electron `safeStorage` → OS keychain (DPAPI on Windows) |
| **Post-compare wipe** | `embeddingArray.fill(0)` immediately after `calculateSimilarity()` returns |
| **Library** | `crypto.subtle` (renderer) · `node:crypto` (main process) |
| **Why** | GCM's authentication tag ensures the cached blob hasn't been tampered with in memory. Zeroing after use prevents embedding recovery from heap dumps or crash reports. |

### Local Cache (general)

| Field | Value |
|---|---|
| **Algorithm** | **AES-256-GCM** via `electron.safeStorage.encryptString()` |
| **Key** | OS-managed (DPAPI / macOS Keychain) — never a hardcoded key |
| **IV** | 96-bit random, generated fresh per encrypt call |

---

## §4 — Model Protection

### Encrypt ONNX Files at Rest

| Field | Value |
|---|---|
| **Data** | `.onnx` model files bundled in the app |
| **Algorithm** | **AES-256-GCM** |
| **Parameters** | 256-bit key · 128-bit random IV stored as file header · 128-bit auth tag |
| **Key derivation** | `HKDF-SHA256(masterSecret, appVersion + modelName)` at runtime |
| **Why** | GCM authenticates the ciphertext — a tampered model file will fail decryption before being loaded into the inference engine, preventing model-substitution attacks. |

**Decrypt-on-load pattern:**
```js
// Pseudocode
const encryptedBuf = fs.readFileSync('model.onnx.enc');
const iv  = encryptedBuf.slice(0, 16);
const tag = encryptedBuf.slice(16, 32);
const ct  = encryptedBuf.slice(32);
const key = await deriveKey(masterSecret, modelName); // HKDF
const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv, tagLength:128 }, key, ct);
// pass pt (ArrayBuffer) directly to ONNX Runtime — never write decrypted file to disk
```

### Integrity Hash on Startup

| Field | Value |
|---|---|
| **Algorithm** | **BLAKE3** (preferred for speed) or **SHA-3-256** (FIPS compliance) |
| **Output size** | 256 bits |
| **Storage** | Hash embedded in signed binary at build time (not in a separate file) |
| **Library** | `blake3` npm package (WASM) or Node `crypto.createHash('sha3-256')` |
| **Why** | BLAKE3 is ~10× faster than SHA-2 at startup; SHA-3 if FIPS compliance is required. Comparing a pre-computed hash before loading the model detects file tampering or corruption. |

---

## §6 — Data Security

### Face Embeddings in Supabase DB

| Field | Value |
|---|---|
| **Data** | `face_registrations.embeddings` (float vector) |
| **Algorithm** | **AES-256-GCM** — encrypt before INSERT, decrypt after SELECT |
| **Key management** | **Supabase Vault** (libsodium `secretbox` under the hood) — one key per user, stored in Vault |
| **IV** | 96-bit random, stored alongside ciphertext as a hex prefix in the column |
| **Why** | Raw embedding vectors in the database allow anyone with DB access to reconstruct a biometric. Encryption ensures the data is useless without the Vault key. |

### Key Rotation (Every 90 Days)

| Field | Value |
|---|---|
| **Pattern** | **Envelope encryption** (DEK + KEK) |
| **KEK algorithm** | **RSA-OAEP-SHA256** (2048-bit) or **ECDH-ES + AES-256-KW** (P-256) |
| **Rotation process** | Generate new KEK → re-wrap existing DEKs with new KEK → retire old KEK |
| **Why** | Re-wrapping DEKs is O(1) per key, not O(n) per record — no need to re-encrypt all embeddings. DEK compromise window is limited to 90 days. |

---

## §8 — Release Hardening

### Encrypted Update Payload

| Field | Value |
|---|---|
| **Payload encryption** | **AES-256-GCM** (symmetric, ephemeral key) |
| **Key delivery** | ECDH ephemeral key exchange (X25519) between update server and client |
| **Signature** | **RSA-PSS-SHA256** (2048-bit) or **Ed25519** |
| **Verification** | `electron-updater` verifies signature against embedded public key before applying |
| **Why** | Encrypting the payload prevents MITM payload inspection; the RSA-PSS/Ed25519 signature prevents MITM payload substitution. Ed25519 is preferred (smaller key, faster verify, no padding issues). |

### EV Code Signing

| Field | Value |
|---|---|
| **Standard** | **Authenticode** (Windows) |
| **Algorithm** | **SHA-256** digest · **RSA-2048** or **ECDSA P-256** signing key |
| **Cert type** | **Extended Validation (EV)** — required for immediate SmartScreen reputation |
| **Timestamp** | RFC 3161 countersignature (so signature remains valid after cert expiry) |
| **Tool** | `signtool.exe /fd sha256 /tr <timestamp-url> /td sha256` |

---

## Algorithm Quick Reference

```
Memory/cache encrypt  →  AES-256-GCM   + safeStorage key (OS keychain)
ONNX model encrypt    →  AES-256-GCM   (HKDF-derived key, IV in file header)
Model integrity       →  BLAKE3-256    (or SHA-3-256 for FIPS)
DB embedding encrypt  →  AES-256-GCM   + Supabase Vault key management
Key wrapping (rotate) →  ECDH-ES + AES-256-KW  (or RSA-OAEP-SHA256)
Update payload        →  AES-256-GCM   + Ed25519 signature
Code signing          →  SHA-256 + RSA-2048 EV cert (Authenticode)
```

> **Core rule:** Authenticate everything — use GCM mode (not CBC) so tampering is detectable. Store all keys in the OS keychain via `safeStorage` or Supabase

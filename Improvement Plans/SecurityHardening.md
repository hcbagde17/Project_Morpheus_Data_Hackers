# SECURITY HARDENING ROADMAP

---

# 1. Code-Level Hardening

- Obfuscate Electron main process
- Hide blacklist signatures
- Encrypt model files (runtime decrypt)
- Remove debug symbols

---

# 2. Anti-Debug Protection

Detect:
- DevTools attach
- Debugger process injection
- Suspicious DLL injection
- Timing attacks (delayed execution detection)

Response:
- Increase risk score
- Soft terminate exam
- Log incident

---

# 3. Memory Protection

- Zero memory after embedding compare
- Avoid storing embeddings in plain JSON
- Encrypt local cache

---

# 4. Model Protection

- Encrypt ONNX files
- Integrity check hash on startup
- Detect tampered models

---

# 5. Electron Hardening

- nodeIntegration: false
- contextIsolation: true
- CSP strict mode
- Disable remote module
- Block navigation

---

# 6. Data Security

- Encrypt embeddings before DB storage
- Use row-level security (already implemented)
- Rotate keys every 90 days

---

# 7. OS-Level Hardening

- Enforce Admin Mode
- Disable external drives (future)
- Detect Hypervisor
- Detect Remote Desktop Session

---

# 8. Release Hardening

- EV Code Signing
- Secure update server
- Encrypted update payload
- Verify update signature

---

END
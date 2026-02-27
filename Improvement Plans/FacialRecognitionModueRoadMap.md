# FACIAL RECOGNITION UPGRADE ROADMAP

Upgrade:
Face-API 128D → SCRFD + ArcFace 512D

---

# 1. Model Selection

Detection:
SCRFD 2.5G

Recognition:
ArcFace r100 ONNX (512D)

---

# 2. Embedding Schema

Table: face_registrations

Columns:
- user_id
- embedding (bytea encrypted)
- quality_score
- capture_metadata
- version

---

# 3. Registration Flow

Capture 10 frames
Filter:
- Frontal pose
- Good lighting
- No occlusion
Average embeddings

Store mean embedding

---

# 4. Verification Flow

Detect
Extract embedding
Compute cosine similarity
Compare threshold

Threshold target:
0.45–0.55 tuned locally

---

# 5. Anti-Spoof

Checks:
- Eye blink
- Head movement challenge
- Texture analysis
- Multi-frame depth consistency

---

END
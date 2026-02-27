# ProctorWatch 3.0
# UPGRADED FLAG SYSTEM (DISCUSSION ARCHITECTURE)

Includes:
- SCRFD + ArcFace 512D
- Anti-spoof pipeline
- Central Risk Engine
- Independent Network Monitor
- Cross-module fusion logic
- Temporal escalation system

---

# 1️⃣ IDENTITY (UPGRADED)

## 🟠 ORANGE — Low Similarity Zone

Trigger:
- 0.45 ≤ similarity < 0.55

Reason:
Borderline mismatch.

---

## 🔴 RED — Identity Mismatch

Trigger:
- similarity < 0.45
for 2 consecutive verifications

---

## 🔴 RED — Spoof Suspected

Triggered if:
- No blink > 15 seconds
- No head movement challenge response
- Texture flatness score high

Reason:
Photo/video spoof likely.

---

## 🟠 ORANGE — Low Face Quality

Trigger:
- Quality score < 0.70

Reason:
Blur/low light/occlusion.

---

# 2️⃣ VISION (UPGRADED)

## 🟠 ORANGE — Repeated Micro Glances

Trigger:
- > 5 short glances in 2 minutes

---

## 🔴 RED — Patterned Gaze Deviation

Trigger:
- Deviation > 2 standard deviations sustained

---

## 🔴 RED — Face Obstruction

Trigger:
- Landmark visibility < 60%

---

# 3️⃣ AUDIO (UPGRADED)

## 🟠 ORANGE — Uncorrelated Speech

Trigger:
- Speech detected without lip movement

---

## 🔴 RED — Confirmed Conversation

Trigger:
- Speech + lip movement
AND duration > 5 seconds

---

## 🟠 ORANGE — Audio Drift Pattern

Trigger:
- 3 speech bursts in 2 minutes

---

# 4️⃣ SYSTEM MONITOR (UPGRADED)

## 🔴 RED — AI Tool Signature Detected

Trigger:
- Process + network behavior match

---

## 🔴 RED — High Entropy Unknown Process

Trigger:
- Unknown process
- > 20% CPU
- Active network
- High memory entropy

---

## 🟠 ORANGE — Suspicious TLS Fingerprint

Trigger:
- JA3 match with AI client pattern

---

# 5️⃣ INDEPENDENT NETWORK MONITOR

## 🟠 ORANGE — Suspicious DNS Queries

Trigger:
- Repeated AI domain resolution

---

## 🔴 RED — Continuous Encrypted Microbursts

Trigger:
- Packets < 500ms interval
for > 3 minutes

---

## 🔴 RED — Hidden Remote Session Pattern

Trigger:
- Port anomaly
+ traffic timing pattern
+ process correlation

---

# 6️⃣ FUSION-BASED FLAGS

## 🔴 RED — Cross-Module High Confidence

Trigger:
- Any module risk > 0.85

---

## 🔴 RED — Multi-Module Correlation

Trigger:
- Audio > 0.70
AND Vision > 0.70
within 30 seconds

---

## 🟠 ORANGE — Risk Drift

Trigger:
- Average risk > 0.55 for 3 minutes

---

# 7️⃣ AUTO TERMINATION RULES

Terminate exam if:

- 1 Identity RED
- 2 System RED
- 3 RED flags in 5 minutes
- Final fusion score > 0.90

---

END OF FILE
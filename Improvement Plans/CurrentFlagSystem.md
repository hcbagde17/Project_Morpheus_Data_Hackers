# ProctorWatch 3.0
# CURRENT FLAG SYSTEM (v2.0 ARCHITECTURE)

Based strictly on:
- MediaPipe Vision v2.0
- Silero VAD + FFT Audio
- systeminformation-based SystemMonitor
- Electron EnforcementService
- No centralized fusion engine

---

# 1️⃣ IDENTITY MONITOR FLAGS

## 🟠 ORANGE — Face Not Visible (Short Duration)

Trigger:
- No face detected > 3 seconds
OR
- Face confidence < 0.80 for 3 consecutive checks

Reason:
Short disappearance may be repositioning.

Escalation:
3 occurrences in 5 minutes → RED

---

## 🔴 RED — Face Missing (Sustained)

Trigger:
- No face detected > 8 seconds continuously

Reason:
High impersonation or camera tampering risk.

---

## 🔴 RED — Multiple Faces Detected

Trigger:
- Face count > 1 for 2 consecutive frames

Reason:
Second person presence.

---

## 🟠 ORANGE — Low Similarity (Suspicion Zone)

Trigger:
- Cosine similarity < 0.60 but > 0.45

Reason:
Lighting or slight angle shift.

---

## 🔴 RED — Identity Mismatch

Trigger:
- Cosine similarity < 0.45 for 2 cycles

Reason:
Strong impersonation likelihood.

---

# 2️⃣ VISION BEHAVIOR FLAGS

## 🟠 ORANGE — Looking Away (Sustained)

Trigger:
- Yaw > 25° OR gaze ratio outside 0.22–0.78
for > 3 seconds

Reason:
Possible off-screen assistance.

---

## 🔴 RED — Extreme Head Turn

Trigger:
- Yaw > 45° for > 4 seconds

Reason:
Clear disengagement.

---

## 🟠 ORANGE — Looking Down

Trigger:
- Pitch > 20° for 3 seconds

Reason:
Possible phone usage.

---

## 🟠 ORANGE — Lip Movement Detected

Trigger:
- MAR > 0.5 OR mouth velocity > 0.08
for > 2 seconds

Reason:
Talking suspected.

Escalation:
5 times in 5 minutes → RED

---

# 3️⃣ AUDIO FLAGS

## 🟠 ORANGE — Speech Detected

Trigger:
- Audio score > 0.65

Reason:
Speech presence.

---

## 🔴 RED — Sustained Speech

Trigger:
- Speech duration > 5 seconds

Reason:
Likely conversation.

---

## 🟠 ORANGE — Whisper Pattern

Trigger:
- Low RMS + high speech-band energy

Reason:
Possible whisper assistance.

---

# 4️⃣ DEVICE MONITOR FLAGS

## 🔴 RED — Tab Switch

Trigger:
- visibilitychange event

Reason:
User left exam tab.

---

## 🔴 RED — Window Blur

Trigger:
- window blur > 1 second

---

## 🔴 RED — DevTools Open

Trigger:
- Resize heuristic triggered

---

## 🔴 RED — Camera Disconnected

Trigger:
- mediaDevices devicechange

---

## 🔴 RED — Mic Disconnected

Trigger:
- Device removal detected

---

# 5️⃣ SYSTEM MONITOR FLAGS

## 🟠 ORANGE — Unknown High CPU Process

Trigger:
- Process > 15% CPU for 3 scans

---

## 🔴 RED — Blacklisted Application Running

Trigger:
- Immediate blacklist match

---

## 🔴 RED — Remote Desktop Tool Detected

Trigger:
- Process name + port correlation

---

## 🟠 ORANGE — VPN Interface Detected

Trigger:
- Interface contains tun/tap/wireguard keywords

---

## 🔴 RED — Gateway Change Mid Exam

Trigger:
- Default gateway changed

---

## 🟠 ORANGE — Network Throughput Spike

Trigger:
- > 3× baseline traffic

Escalation:
3 spikes in 10 minutes → RED

---

END OF FILE
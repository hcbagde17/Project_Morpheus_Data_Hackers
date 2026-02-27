# INDEPENDENT NETWORK MONITOR (BACKUP SYSTEM)

Purpose:
Detect ghost AI, hidden browser AI, remote assistants invisible to screen share.

---

# 1. Architecture

Renderer → Minimal
Electron Main → Active
Native Service (Optional Future) → Deep

---

# 2. Detection Mechanisms

## 2.1 DNS Query Monitoring

Flag:
- Frequent AI domain resolution
- OpenAI, Gemini, Claude domains

## 2.2 TLS Fingerprint Monitoring

Analyze:
- JA3 fingerprints
- TLS client hello patterns

## 2.3 Outbound Data Pattern Analysis

Detect:
- Continuous small packet bursts
- Encrypted traffic spikes

## 2.4 Port Entropy Scoring

Unexpected outbound ports > threshold → increase risk

---

# 3. Risk Score Model

network_score =
(0.3 * dns_anomaly) +
(0.3 * traffic_spike) +
(0.2 * port_irregularity) +
(0.2 * timing_pattern)

---

# 4. Deployment Plan

Phase 1:
- Extend SystemMonitor

Phase 2:
- Dedicated background network service

Phase 3:
- Lightweight kernel-level driver (future)

---

END
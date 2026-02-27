# CENTRALIZED RISK ENGINE

---

# 1. Philosophy

Every module outputs:
- Risk Score
- Confidence
- Evidence snapshot

Risk engine decides:
- Flag
- Severity
- Auto-action

---

# 2. Risk Aggregation

identity_risk
vision_risk
audio_risk
system_risk
network_risk

Fusion:

final =
Σ(weight_i * risk_i)

---

# 3. Temporal Escalation Logic

If:
3 ORANGE flags in 5 min → RED

If:
identity mismatch > 2 cycles → RED

If:
system + network both high → RED instantly

---

# 4. Evidence Priority

Identity > Network > System > Vision > Audio

---

# 5. Drift Detection

Track:
Mean risk score per student

If baseline drift:
increase sensitivity

---

END
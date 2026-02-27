# Implementation Plans Directory

This directory contains all implementation plans for the ProctorWatch AI Proctoring System.

## Core Plans

### 1. [Master Reimplementation Plan](./master_reimplementation_plan.md)
**Date**: Feb 16, 2026  
**Purpose**: Comprehensive master plan covering all modules, models, algorithms, and blocking policies. Use this as the primary reference for understanding the complete system architecture.

**Contents**:
- All AI models and scoring algorithms
- What gets blocked vs allowed vs flagged
- API keys and dependencies
- Known glitches and solutions
- Implementation paths (incremental vs clean rebuild)

---

## Module-Specific Plans

### 2. [Audio Intelligence](./implementation_plan_audio_intelligence.md)
- Speech detection using Silero VAD
- Near-field estimation with FFT
- Lip sync correlation
- Scoring formula (40% speech + 25% near-field + 10% lip sync)

### 3. [Vision Intelligence](./implementation_plan_vision_intelligence.md)
- MediaPipe FaceLandmarker for gaze and pose tracking
- Head pose estimation (PnP solver)
- Iris gaze tracking
- Lip movement analysis

### 4. [Network & System Monitoring](./implementation_plan_network_monitoring.md)
- Process blacklist detection
- VPN detection
- Network anomaly monitoring
- System behavior correlation

### 5. [Windows Enforcement](./implementation_plan_exam_enforcement.md)
- Native Windows API (FFI with koffi)
- Keyboard hooks for blocking shortcuts
- Process termination
- Clipboard wiping
- Focus enforcement

### 6. [Admin Privileges](./implementation_plan_admin_privileges.md)
- Admin rights detection
- UAC elevation prompt
- PreTestCheck integration

---

## Feature-Specific Plans

### 7. [Aggressive Blocking Enforcement](./implementation_plan_aggressive_blocking.md)
**Date**: Feb 16, 2026  
**Purpose**: Full enforcement of all blocking policies

**Blocks**:
- Alt+Tab, Windows Key, Task Manager
- DevTools (Ctrl+Shift+I/J) - but allows F12
- Copy/Paste (clipboard wiped every 500ms)
- 30+ forbidden apps (browsers, VPNs, communication tools)

### 8. [Configurable Process Blacklist](./implementation_plan_configurable_blacklist.md)
**Date**: Feb 16, 2026  
**Purpose**: Admin-configurable blacklist system with 57+ default apps

**Features**:
- Database-backed blacklist (Supabase)
- Admin dashboard for management
- Category-based organization (Browsers, VPNs, Communication)
- Whitelist override capability
- Pre-exam kill + during-exam flagging strategy

### 9. [Admin Override Panel](./implementation_plan_admin_override.md)
- Ctrl+Shift+A hotkey
- Toggle individual proctoring modules
- Admin authentication requirement

### 10. [Face ID Update Feature](./implementation_plan_face_update.md)
- Re-capture face for recognition
- Admin authentication dialog
- Evidence clearing workflow

---

## Implementation Status

| Plan | Status | Priority |
|------|--------|----------|
| Master Reimplementation | ✅ Complete | Reference |
| Audio Intelligence | ✅ Implemented | Core |
| Vision Intelligence | ✅ Implemented | Core |
| Network Monitoring | ✅ Implemented | Core |
| Windows Enforcement | ✅ Implemented | Core |
| Admin Privileges | ✅ Implemented | Setup |
| Aggressive Blocking | ✅ Implemented | Security |
| Configurable Blacklist | 📋 Planned | Enhancement |
| Admin Override | ✅ Implemented | Admin Tools |
| Face ID Update | ✅ Implemented | Admin Tools |

---

## Quick Reference

### Models Used
- **MediaPipe FaceLandmarker** (Vision) - Face detection, iris tracking
- **Silero VAD v4** (Audio) - Speech detection
- **COCO-SSD** (Vision) - Object detection
- **systeminformation** (System) - Process/network monitoring
- **koffi FFI** (Enforcement) - Native Windows APIs

### No API Keys Required
All AI models run **offline** in the browser. Only Supabase credentials needed for database/storage.

### Blocking Summary
- ✅ **Blocked**: Alt+Tab, Task Manager, DevTools shortcuts, Windows Key, Copy/Paste, 57+ apps
- ⚠️ **Flagged**: Looking away, talking, multiple faces, network anomalies
- ✅ **Allowed**: F12 (DevTools), screenshots, exam submission

---

## Next Steps

1. Review [Master Reimplementation Plan](./master_reimplementation_plan.md) for full context
2. Implement [Configurable Blacklist System](./implementation_plan_configurable_blacklist.md)
3. Test all enforcement scenarios
4. Deploy to production

---

**Last Updated**: February 16, 2026  
**Total Plans**: 10  
**System Status**: Production Ready (except Configurable Blacklist)

# Implementation Plan: Network & External Assistance Monitoring (Phase 1)

**Goal**: Detect unauthorized external assistance (Ghost AI, Remote Desktop, Hidden Communication) using system-level monitoring via Electron.

## 1. Technical Architecture

### Core Constraint
Web Browsers (Renderer) **cannot** access system processes or detailed network tables. This module **MUST** run in the **Electron Main Process** (Node.js environment).

### Components
1.  **System Monitor Service (Main Process)**:
    *   Library: `systeminformation` (npm).
    *   Role: Fetches Process List, Active Network Connections, Interface Stats.
    *   Interval: Every 5-10 seconds (to avoid CPU spikes).
2.  **Risk Engine (Main Process)**:
    *   Analyzes raw data against Blacklists/Heuristics.
    *   Calculates `process_risk`, `network_anomaly`, `vpn_risk`, `remote_access_score`.
3.  **IPC Bridge**:
    *   Channels: `proctoring:network-risk-update`.
    *   Sends calculated scores to Renderer.
4.  **Renderer Integration**:
    *   `NetworkMonitor.jsx`: Visualizes risk and handles "System Behavior Correlation" (typing + net spikes).

## 2. Dependencies to Add
- `systeminformation`: Comprehensive system stats (Cross-platform Windows/Mac/Linux).

## 3. Detection Models & Algorithms

### A. Process Intelligence (25%)
*   **Input**: List of running processes (`si.processes()`).
*   **Logic**:
    *   **Blacklist Check**: `TeamViewer`, `AnyDesk`, `Discord`, `Slack`, `Skype`, `python` (if strict), `node` (active outside app), `ngrok`.
    *   **Heuristic**: High CPU usage background processes with unknown names.
*   **Output**:
    *   `process_risk_score`: 1.0 if Blacklisted app found. 0.5 if suspicious unknown.

### B. Network Activity Profiling (25%)
*   **Input**: Active connections (`si.networkConnections()`) + Interface stats.
*   **Logic**:
    *   **Port Check**: Connections on ports 3389 (RDP), 5900 (VNC), 22 (SSH).
    *   **State Check**: High number of `ESTABLISHED` connections to non-whitelisted IPs.
    *   **Througput**: Sudden spikes in TX/RX bytes (`si.networkStats()`).
*   **Output**:
    *   `network_anomaly_score`: 0.0 to 1.0 based on rule matches.

### C. VPN / Proxy Detection (20%)
*   **Input**: Network Interfaces (`si.networkInterfaces()`).
*   **Logic**:
    *   **Keyword Match**: "Tap", "Tun", "VPN", "WireGuard", "OpenVPN", "Cloudflare".
    *   **Gateway Check**: Default gateway changes during exam.
*   **Output**: 
    *   `vpn_risk_score`: 1.0 if VPN interface active, 0.5 if suspect.

### D. Remote Control Indicators (15%)
*   **Input**: Combined Process + Port correlations.
*   **Logic**:
    *   Process `TeamViewer.exe` AND Port `5938` active.
    *   Process `mstsc.exe` or `rdpclip.exe` active.
*   **Output**:
    *   `remote_access_score`: 1.0 (Critical RED Flag).

### E. System Behavior Correlation (15%)
*   **Location**: **Renderer Side**.
*   **Logic**:
    *   Track `last_keystroke_time`.
    *   Track `last_network_spike_time` (from Main IPC).
    *   If `(spike_time - keystroke_time) < 500ms`: **High Correlation**.
*   **Output**:
    *   `correlation_score`: increment on sync events.

## 4. Final Risk Formula (Main + Renderer Fusion)

```javascript
// Calculated in Renderer using data from Main
final_risk = 
    (0.25 * process_risk) +
    (0.25 * network_anomaly) +
    (0.20 * vpn_risk) +
    (0.15 * remote_access) +
    (0.15 * correlation_score);

// Thresholds
if (final_risk > 0.70) -> RED FLAG (Deterministic Violation)
if (final_risk > 0.40) -> ORANGE FLAG (Suspicious Environment)
```

## 5. Implementation Steps

### Step 1: Main Process Setup
- [ ] Install `systeminformation`.
- [ ] Create `electron/services/SystemMonitor.js`.
- [ ] Implement `getProcessRisk()`, `getNetworkRisk()`, `getInterfaceRisk()`.

### Step 2: Risk Engine Logic
- [ ] Define `BLACKLIST_PROCESSES` (json).
- [ ] Define `SUSPICIOUS_PORTS` (json).
- [ ] Implement aggregation loop (setInterval).

### Step 3: IPC & Secure Bridge
- [ ] Add `proctoring:start-monitor`, `proctoring:stop-monitor` handlers.
- [ ] Add `proctoring:risk-update` event emitter.
- [ ] Update `preload.cjs` to expose these securely.

### Step 4: Renderer Integration
- [ ] Update `NetworkMonitor.jsx` to consume IPC events.
- [ ] Implement "Keystroke Correlation" logic in `ExamSession` or `NetworkMonitor`.
- [ ] Visual Risk Dashboard (Processes list snippet).

### Step 5: Evidence & Logging
- [ ] On Flag: Snapshot of `process_list` and `netstat` sent to Supabase.

## 6. Safety & Performance
- **Sandbox**: Child processes for `systeminformation` calls to prevent main thread blocking.
- **Privacy**: Only hash/mask process names if required (Phase 2), strictly necessary data only. 

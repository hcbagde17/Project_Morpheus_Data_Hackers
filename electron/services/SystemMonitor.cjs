/**
 * SystemMonitor v2.0 — Main Process Network & System Monitoring
 *
 * SCORING COMPONENTS (Main Process side):
 *   1. Process Intelligence (25%)  — Blacklist + heuristic CPU flagging
 *   2. Network Anomaly (25%)       — Port scanning + throughput baseline + spike detection
 *   3. VPN/Proxy Detection (20%)   — Interface keyword match + gateway change detection
 *   4. Remote Control (15%)        — Process + port correlation for RDP/VNC/TeamViewer
 *
 * Component 5 (System Behavior Correlation, 15%) runs in Renderer (NetworkMonitor.jsx).
 *
 * IMPROVEMENTS OVER v1.0:
 *   - Throughput baseline tracking (first 3 scans establish baseline)
 *   - Network spike detection (TX/RX deviation from baseline)
 *   - Enhanced process heuristics (high-CPU unknown processes flagged at 0.3)
 *   - Gateway change detection (captures initial gateway, flags changes)
 *   - Connection counting (excessive ESTABLISHED connections → anomaly)
 *   - Comprehensive process blacklist with categories
 *   - Exponential smoothing on all scores
 *   - Detailed evidence snapshots for flagging
 *   - Proper error handling and cleanup
 */

const si = require('systeminformation');

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────
const CONFIG = {
    SCAN_INTERVAL_MS: 8000,        // 8 seconds between scans
    BASELINE_SCANS: 3,             // Number of scans to establish throughput baseline
    SMOOTHING_ALPHA: 0.3,          // Exponential smoothing factor

    // Throughput spike detection
    THROUGHPUT_SPIKE_FACTOR: 3.0,  // TX/RX must exceed baseline by this multiplier
    MAX_ESTABLISHED_CONNS: 50,     // Above this = suspicious connection count
    CONNECTION_ANOMALY_SCORE: 0.3, // Score for high connection count

    // Unknown process heuristic
    UNKNOWN_CPU_THRESHOLD: 15,     // % CPU usage to flag unknown process
};

// ─────────────────────────────────────────────
// BLACKLISTS & DETECTION RULES
// ─────────────────────────────────────────────

// Process Blacklist — organized by category for clarity
const BLACKLIST_PROCESSES = {
    remote_desktop: [
        'teamviewer', 'anydesk', 'logmein', 'remotedesktop', 'vnc',
        'vncviewer', 'vncserver', 'mstsc', 'rdpclip', 'tv_w32',
        'ammyyadmin', 'rustdesk', 'splashtop', 'ultraviewer',
        'parsec', 'nomachine', 'supremo',
    ],
    communication: [
        'discord', 'slack', 'skype', 'telegram', 'signal', 'whatsapp',
        'zoom', 'teams', 'webex', 'viber', 'line', 'element',
        'guilded', 'mumble', 'ventrilo',
    ],
    ai_assistants: [
        'chatgpt', 'openai', 'claude', 'copilot', 'bard',
        'notion', 'obsidian',
    ],
    dev_tools: [
        'code', 'vscode', 'python', 'powershell', 'cmd',
        'terminal', 'ngrok', 'wireshark', 'fiddler', 'postman',
        'insomnia', 'cheatengine', 'rehex',
    ],
    screen_capture: [
        'obs64', 'obs32', 'obs', 'sharex', 'bandicam',
        'camtasia', 'screenrecorder', 'loom', 'streamlabs',
    ],
    tunneling: [
        'ngrok', 'localtunnel', 'cloudflared', 'frpc', 'zerotier',
        'hamachi', 'radmin',
    ],
};

// Flatten for quick lookup
const ALL_BLACKLISTED = Object.values(BLACKLIST_PROCESSES).flat();

// Suspicious ports
const SUSPICIOUS_PORTS = {
    3389: 'RDP',
    5900: 'VNC',
    5901: 'VNC',
    5938: 'TeamViewer',
    22: 'SSH',
    1723: 'PPTP VPN',
    4444: 'Metasploit',
    8080: 'Proxy',
    4040: 'Ngrok',
    1080: 'SOCKS Proxy',
    3128: 'HTTP Proxy',
};

// VPN interface keywords
const VPN_KEYWORDS = [
    'tun', 'tap', 'vpn', 'wireguard', 'openvpn',
    'cloudflare', 'warp', 'proton', 'nordvpn', 'expressvpn',
    'surfshark', 'mullvad', 'cyberghost', 'private internet',
    'tunnelbear', 'windscribe', 'hotspot shield',
];

// Remote control process names (exact match for high-confidence)
const REMOTE_CONTROL_PROCESSES = [
    'mstsc.exe', 'rdpclip.exe', 'tv_w32.exe', 'anydesk.exe',
    'teamviewer.exe', 'teamviewer_service.exe',
    'vncviewer.exe', 'vncserver.exe', 'ultraviewer.exe',
    'ammyy_admin.exe', 'rustdesk.exe', 'parsec.exe',
];

// Remote control ports
const REMOTE_CONTROL_PORTS = [3389, 5900, 5901, 5938];

// ─────────────────────────────────────────────
// EXPONENTIAL SMOOTHER (simple inline)
// ─────────────────────────────────────────────
class Smoother {
    constructor(alpha = CONFIG.SMOOTHING_ALPHA) {
        this.alpha = alpha;
        this.value = null;
    }
    update(raw) {
        if (this.value === null) this.value = raw;
        else this.value = this.alpha * raw + (1 - this.alpha) * this.value;
        return this.value;
    }
    get() { return this.value ?? 0; }
    reset() { this.value = null; }
}

// ─────────────────────────────────────────────
// MAIN CLASS
// ─────────────────────────────────────────────
class SystemMonitor {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.interval = null;
        this.scanCount = 0;

        // Throughput baseline
        this.baselineTX = 0;
        this.baselineRX = 0;
        this.throughputSamples = [];
        this.baselineEstablished = false;

        // Gateway tracking
        this.initialGateway = null;

        // Smoothers
        this.smoothers = {
            process: new Smoother(),
            network: new Smoother(),
            vpn: new Smoother(),
            remote: new Smoother(),
        };

        // Last known data for snapshot
        this.lastRiskData = null;
    }

    // ─────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────

    start() {
        if (this.interval) return;
        console.log('[SystemMonitor] Starting background scans (interval: 8s)...');
        this.scan(); // Immediate first scan
        this.interval = setInterval(() => this.scan(), CONFIG.SCAN_INTERVAL_MS);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.scanCount = 0;
        this.throughputSamples = [];
        this.baselineEstablished = false;
        this.initialGateway = null;
        Object.values(this.smoothers).forEach(s => s.reset());
        console.log('[SystemMonitor] Stopped.');
    }

    // ─────────────────────────────────────────
    // MAIN SCAN LOOP
    // ─────────────────────────────────────────

    async scan() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

        try {
            this.scanCount++;

            // Parallel data fetch for performance
            const [processes, connections, interfaces, netStats, defaultGateway] = await Promise.all([
                si.processes().catch(() => ({ list: [] })),
                si.networkConnections().catch(() => []),
                si.networkInterfaces().catch(() => []),
                si.networkStats().catch(() => []),
                si.networkGatewayDefault().catch(() => null),
            ]);

            // Capture initial gateway on first scan
            if (!this.initialGateway && defaultGateway) {
                this.initialGateway = defaultGateway;
            }

            // ── 1. Process Intelligence ──
            const processRisk = this._analyzeProcesses(processes.list || []);

            // ── 2. Network Anomaly ──
            const networkAnomaly = this._analyzeNetwork(connections, netStats);

            // ── 3. VPN / Proxy Detection ──
            const vpnRisk = this._analyzeInterfaces(interfaces, defaultGateway);

            // ── 4. Remote Control Detection ──
            const remoteAccess = this._detectRemoteControl(processes.list || [], connections);

            // Apply smoothing
            const smoothedData = {
                processRisk: {
                    score: this.smoothers.process.update(processRisk.score),
                    rawScore: processRisk.score,
                    matches: processRisk.matches,
                    categories: processRisk.categories,
                    unknownHighCPU: processRisk.unknownHighCPU,
                },
                networkAnomaly: {
                    score: this.smoothers.network.update(networkAnomaly.score),
                    rawScore: networkAnomaly.score,
                    suspiciousPorts: networkAnomaly.suspiciousPorts,
                    portDetails: networkAnomaly.portDetails,
                    throughputSpike: networkAnomaly.throughputSpike,
                    establishedCount: networkAnomaly.establishedCount,
                    isCalibrating: !this.baselineEstablished,
                },
                vpnRisk: {
                    score: this.smoothers.vpn.update(vpnRisk.score),
                    rawScore: vpnRisk.score,
                    interface: vpnRisk.interface,
                    gatewayChanged: vpnRisk.gatewayChanged,
                },
                remoteAccess: {
                    score: this.smoothers.remote.update(remoteAccess.score),
                    rawScore: remoteAccess.score,
                    detected: remoteAccess.detected,
                    port: remoteAccess.port,
                },
                timestamp: Date.now(),
                scanNumber: this.scanCount,
            };

            this.lastRiskData = smoothedData;

            // Send to Renderer via IPC
            this.mainWindow.webContents.send('proctoring:network-risk-update', smoothedData);

        } catch (err) {
            console.error('[SystemMonitor] Scan error:', err.message);
        }
    }

    // ─────────────────────────────────────────
    // A. PROCESS INTELLIGENCE (25%)
    // ─────────────────────────────────────────

    _analyzeProcesses(processList) {
        let score = 0;
        const matches = [];
        const categories = new Set();
        const unknownHighCPU = [];

        for (const proc of processList) {
            const name = (proc.name || '').toLowerCase();

            // ── Blacklist check ──
            const matched = ALL_BLACKLISTED.some(bp => name.includes(bp));
            if (matched) {
                score = 1.0;
                if (!matches.includes(name)) matches.push(name);

                // Determine category
                for (const [cat, list] of Object.entries(BLACKLIST_PROCESSES)) {
                    if (list.some(bp => name.includes(bp))) {
                        categories.add(cat);
                    }
                }
            }

            // ── Heuristic: High-CPU unknown processes ──
            if (!matched && proc.cpu > CONFIG.UNKNOWN_CPU_THRESHOLD) {
                // Skip known system processes
                const isSystem = ['system', 'csrss', 'svchost', 'explorer', 'dwm',
                    'searchhost', 'runtimebroker', 'taskmgr', 'winlogon',
                    'services', 'lsass', 'spoolsv', 'wininit', 'smss',
                    'ctfmon', 'conhost', 'dllhost', 'applicationframehost',
                    'electron', 'pw', 'proctorwatch',
                ].some(sys => name.includes(sys));

                if (!isSystem) {
                    unknownHighCPU.push({ name: proc.name, cpu: proc.cpu.toFixed(1) });
                    score = Math.max(score, 0.3);
                }
            }
        }

        return { score, matches, categories: [...categories], unknownHighCPU };
    }

    // ─────────────────────────────────────────
    // B. NETWORK ANOMALY (25%)
    // ─────────────────────────────────────────

    _analyzeNetwork(connections, netStats) {
        let score = 0;
        let suspiciousPorts = 0;
        const portDetails = [];

        // ── Port scanning ──
        for (const conn of connections) {
            if (conn.state === 'ESTABLISHED') {
                const localPort = conn.localPort;
                const peerPort = conn.peerPort;

                if (SUSPICIOUS_PORTS[localPort]) {
                    suspiciousPorts++;
                    portDetails.push({ port: localPort, label: SUSPICIOUS_PORTS[localPort], direction: 'local' });
                }
                if (SUSPICIOUS_PORTS[peerPort]) {
                    suspiciousPorts++;
                    portDetails.push({ port: peerPort, label: SUSPICIOUS_PORTS[peerPort], direction: 'peer' });
                }
            }
        }

        if (suspiciousPorts > 0) score += 0.5;
        if (suspiciousPorts > 2) score = Math.max(score, 0.8);

        // ── Connection count anomaly ──
        const established = connections.filter(c => c.state === 'ESTABLISHED').length;
        if (established > CONFIG.MAX_ESTABLISHED_CONNS) {
            score = Math.max(score, CONFIG.CONNECTION_ANOMALY_SCORE);
        }

        // ── Throughput spike detection ──
        let throughputSpike = false;
        if (netStats && netStats.length > 0) {
            const totalTX = netStats.reduce((s, n) => s + (n.tx_sec || 0), 0);
            const totalRX = netStats.reduce((s, n) => s + (n.rx_sec || 0), 0);

            if (this.scanCount <= CONFIG.BASELINE_SCANS) {
                // Collecting baseline
                this.throughputSamples.push({ tx: totalTX, rx: totalRX });

                if (this.scanCount === CONFIG.BASELINE_SCANS) {
                    // Finalize baseline
                    const n = this.throughputSamples.length;
                    this.baselineTX = this.throughputSamples.reduce((s, x) => s + x.tx, 0) / n;
                    this.baselineRX = this.throughputSamples.reduce((s, x) => s + x.rx, 0) / n;
                    this.baselineEstablished = true;
                    console.log(`[SystemMonitor] Throughput baseline: TX=${(this.baselineTX / 1024).toFixed(1)}KB/s, RX=${(this.baselineRX / 1024).toFixed(1)}KB/s`);
                }
            } else if (this.baselineEstablished) {
                // Check for spikes
                const txSpike = this.baselineTX > 0 && totalTX > this.baselineTX * CONFIG.THROUGHPUT_SPIKE_FACTOR;
                const rxSpike = this.baselineRX > 0 && totalRX > this.baselineRX * CONFIG.THROUGHPUT_SPIKE_FACTOR;

                if (txSpike || rxSpike) {
                    throughputSpike = true;
                    score = Math.max(score, 0.4);
                }
            }
        }

        return {
            score: Math.min(1.0, score),
            suspiciousPorts,
            portDetails,
            throughputSpike,
            establishedCount: established,
        };
    }

    // ─────────────────────────────────────────
    // C. VPN / PROXY DETECTION (20%)
    // ─────────────────────────────────────────

    _analyzeInterfaces(interfaces, currentGateway) {
        let score = 0;
        let foundInterface = null;
        let gatewayChanged = false;

        // ── Interface keyword matching ──
        for (const iface of interfaces) {
            const name = (iface.iface || '').toLowerCase();
            const type = (iface.type || '').toLowerCase();
            const ifaceName = (iface.ifaceName || '').toLowerCase();

            const allFields = `${name} ${type} ${ifaceName}`;

            if (VPN_KEYWORDS.some(k => allFields.includes(k))) {
                // Only flag if the interface is actually up/active
                if (iface.operstate === 'up' || iface.speed > 0 || !iface.operstate) {
                    score = 0.5;
                    foundInterface = iface.iface || name;
                }
            }
        }

        // ── Gateway change detection ──
        if (this.initialGateway && currentGateway) {
            if (currentGateway !== this.initialGateway) {
                gatewayChanged = true;
                score = Math.max(score, 0.7); // Gateway change is highly suspicious
                console.log(`[SystemMonitor] Gateway changed: ${this.initialGateway} → ${currentGateway}`);
            }
        }

        return { score, interface: foundInterface, gatewayChanged };
    }

    // ─────────────────────────────────────────
    // D. REMOTE CONTROL DETECTION (15%)
    // ─────────────────────────────────────────

    _detectRemoteControl(processList, connections) {
        let score = 0;
        let detected = null;
        let port = null;

        // ── Process-based detection (high confidence) ──
        for (const proc of processList) {
            const name = (proc.name || '').toLowerCase();
            if (REMOTE_CONTROL_PROCESSES.some(rp => name === rp.toLowerCase())) {
                score = 1.0;
                detected = proc.name;
                break;
            }
        }

        // ── Port-based detection (corroborative) ──
        for (const conn of connections) {
            if (conn.state === 'ESTABLISHED' && REMOTE_CONTROL_PORTS.includes(conn.localPort)) {
                score = Math.max(score, 0.8);
                port = conn.localPort;
                if (!detected) detected = `Port ${conn.localPort}`;
                break;
            }
        }

        // ── Combined: Process + Port = absolute certainty ──
        if (detected && port) {
            score = 1.0;
        }

        return { score, detected, port };
    }

    // ─────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────

    /**
     * Get the latest risk snapshot (for on-demand queries).
     */
    getLastRiskData() {
        return this.lastRiskData;
    }
}

module.exports = SystemMonitor;

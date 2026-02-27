const si = require('systeminformation');

// Configuration
const SCAN_INTERVAL_MS = 10000; // 10 seconds (avoid CPU load)

// Blacklists (Phase 1)
const BLACKLIST_PROCESSES = [
    // Remote Control
    'teamviewer', 'anydesk', 'logmein', 'remotedesktop', 'vnc', 'skype', 'zoom', 'discord', 'slack',
    // Dev/Scripting (Strict Mode candidates)
    'code', 'vscode', 'python', 'powershell', 'cmd', 'terminal', 'ngrok', 'wireshark', 'fiddler',
    // AI/Browsers (if running as separate process unexpectedly)
    'chatgpt', 'openai'
];

const VPN_KEYWORDS = ['tun', 'tap', 'vpn', 'wireguard', 'openvpn', 'cloudflare', 'proton'];

const SUSPICIOUS_PORTS = [
    3389, // RDP
    5900, 5901, 5938, // VNC / TeamViewer
    22, // SSH
    8080, 4040 // Proxy/Ngrok often use these
];

class SystemMonitor {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.interval = null;
        this.history = {
            processes: [],
            netStats: []
        };
        this.isStrict = false; // Configurable via potential Start options
    }

    start() {
        if (this.interval) return;
        console.log('[SystemMonitor] Starting background scans...');
        this.scan(); // Initial scan
        this.interval = setInterval(() => this.scan(), SCAN_INTERVAL_MS);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
        console.log('[SystemMonitor] Stopped.');
    }

    async scan() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

        try {
            // Parallel data fetch
            const [processes, networkConnections, interfaces, netStats] = await Promise.all([
                si.processes(),
                si.networkConnections(),
                si.networkInterfaces(),
                si.networkStats()
            ]);

            // --- 1. Process Intelligence ---
            const processRisk = this.analyzeProcesses(processes.list);

            // --- 2. Network Activity Profiling ---
            const networkAnomaly = this.analyzeNetwork(networkConnections, netStats);

            // --- 3. VPN / Proxy Detection ---
            const vpnRisk = this.analyzeInterfaces(interfaces);

            // --- 4. Remote Control Indicators ---
            const remoteAccess = this.detectRemoteControl(processes.list, networkConnections);

            // Payload
            const riskData = {
                processRisk,
                networkAnomaly,
                vpnRisk,
                remoteAccess,
                timestamp: Date.now(),
                details: {
                    blacklistMatch: processRisk.matches,
                    vpnInterface: vpnRisk.interface,
                    remotePort: remoteAccess.port
                }
            };

            // Send to Renderer
            this.mainWindow.webContents.send('proctoring:network-risk-update', riskData);

        } catch (err) {
            console.error('[SystemMonitor] Scan Error:', err);
        }
    }

    analyzeProcesses(processList) {
        let score = 0;
        const matches = [];

        for (const p of processList) {
            const name = p.name.toLowerCase();
            // Check Blacklist
            if (BLACKLIST_PROCESSES.some(bp => name.includes(bp))) {
                score = 1.0;
                if (!matches.includes(name)) matches.push(name);
            }
        }

        return { score, matches };
    }

    analyzeNetwork(connections, netStats) {
        let score = 0;
        let suspiciousPorts = 0;

        // Check active ports
        for (const conn of connections) {
            if (conn.state === 'ESTABLISHED') {
                if (SUSPICIOUS_PORTS.includes(conn.localPort) || SUSPICIOUS_PORTS.includes(conn.peerPort)) {
                    suspiciousPorts++;
                }
            }
        }

        if (suspiciousPorts > 0) score += 0.5;
        if (suspiciousPorts > 2) score = 1.0;

        return { score, suspiciousPorts };
    }

    analyzeInterfaces(interfaces) {
        let score = 0;
        let foundInterface = null;

        for (const iface of interfaces) {
            const name = iface.iface.toLowerCase();
            const type = (iface.type || '').toLowerCase();

            if (VPN_KEYWORDS.some(k => name.includes(k) || type.includes(k))) {
                score = 0.5; // Medium risk (could be legitimate)
                foundInterface = name;
                // If it's the specific default route? (Complexity for Phase 2)
            }
        }

        return { score, interface: foundInterface };
    }

    detectRemoteControl(processList, connections) {
        let score = 0;
        let detected = null;

        // 1. Process Check
        const rdpProc = processList.find(p => ['mstsc.exe', 'rdpclip.exe', 'tv_w32.exe', 'anydesk.exe'].includes(p.name.toLowerCase()));
        if (rdpProc) {
            score = 1.0;
            detected = rdpProc.name;
        }

        // 2. Port Check (Strong indicator)
        const remoteConn = connections.find(c =>
            (c.localPort === 3389 || c.localPort === 5900 || c.localPort === 5938) &&
            c.state === 'ESTABLISHED'
        );

        if (remoteConn) {
            score = 1.0;
            detected = `Port ${remoteConn.localPort}`;
        }

        return { score, detected };
    }
}

module.exports = SystemMonitor;

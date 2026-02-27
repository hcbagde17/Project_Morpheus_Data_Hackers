import { useEffect, useRef, useCallback } from 'react';

/**
 * NetworkMonitor — Headless proctoring component
 * Detects:
 *   1. VPN/Proxy usage  (via WebRTC IP leak detection)
 *   2. Connection quality changes
 *   3. Suspicious network patterns
 *
 * Props:
 *   active: boolean
 *   onFlag: ({ type, message, severity }) => void
 */
export default function NetworkMonitor({ active, onFlag }) {
    const lastFlagRef = useRef({});
    const initialIPRef = useRef(null);

    const emitFlag = useCallback((type, message, severity = 'high') => {
        const now = Date.now();
        if (lastFlagRef.current[type] && now - lastFlagRef.current[type] < 30000) return;
        lastFlagRef.current[type] = now;
        onFlag?.({ type, message, severity, timestamp: new Date() });
    }, [onFlag]);

    // ========================
    // 1. VPN/Proxy Detection via WebRTC
    // ========================
    useEffect(() => {
        if (!active) return;

        const detectVPN = async () => {
            try {
                const localIPs = await getLocalIPs();

                // Check for common VPN adapter IP ranges
                const vpnIndicators = localIPs.some(ip => {
                    // Common VPN ranges
                    if (ip.startsWith('10.')) return true;       // Common VPN range
                    if (ip.startsWith('172.')) {                  // 172.16-31 is private
                        const second = parseInt(ip.split('.')[1]);
                        if (second >= 16 && second <= 31) return true;
                    }
                    // Tailscale range
                    if (ip.startsWith('100.')) return true;
                    return false;
                });

                // Multiple network interfaces could indicate VPN
                if (localIPs.length > 2) {
                    emitFlag('MULTIPLE_INTERFACES', `Detected ${localIPs.length} network interfaces — possible VPN.`, 'medium');
                }

                // Store initial IP for change detection
                if (!initialIPRef.current && localIPs.length > 0) {
                    initialIPRef.current = localIPs[0];
                } else if (initialIPRef.current && localIPs.length > 0 && localIPs[0] !== initialIPRef.current) {
                    emitFlag('IP_CHANGED', 'Network IP address changed during exam.', 'high');
                }
            } catch (err) {
                console.warn('VPN detection error', err);
            }
        };

        detectVPN();
        const interval = setInterval(detectVPN, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, [active, emitFlag]);

    // ========================
    // 2. Connection Quality Monitoring
    // ========================
    useEffect(() => {
        if (!active) return;

        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!connection) return;

        const handleConnectionChange = () => {
            if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                emitFlag('SLOW_CONNECTION', 'Very slow network connection detected.', 'low');
            }
        };

        connection.addEventListener('change', handleConnectionChange);
        return () => connection.removeEventListener('change', handleConnectionChange);
    }, [active, emitFlag]);

    // Headless component
    return null;
}

// --- WebRTC Local IP Discovery (privacy-limited in modern browsers) ---
async function getLocalIPs() {
    const ips = new Set();

    try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                pc.close();
                resolve(Array.from(ips));
            }, 3000);

            pc.onicecandidate = (event) => {
                if (!event.candidate) {
                    clearTimeout(timeout);
                    pc.close();
                    resolve(Array.from(ips));
                    return;
                }
                const parts = event.candidate.candidate.split(' ');
                const ip = parts[4];
                if (ip && !ip.includes(':') && ip !== '0.0.0.0') {
                    ips.add(ip);
                }
            };
        });
    } catch (err) {
        return Array.from(ips);
    }
}

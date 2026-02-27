import { useEffect, useState, useRef, useCallback } from 'react';
import {
    Box, Typography, LinearProgress, Chip, Collapse,
} from '@mui/material';
import {
    Router, RouterOutlined, VpnLock, Dns, ExpandMore, ExpandLess,
    Cable, PersonSearch, TrendingUp, Keyboard,
} from '@mui/icons-material';

/**
 * NetworkMonitor UI Component (v2.0)
 *
 * Renderer-side component that:
 * 1. Starts/stops the main-process SystemMonitor via IPC
 * 2. Receives risk updates via IPC events
 * 3. Calculates the System Behavior Correlation score (keystroke ↔ network spike)
 * 4. Computes the final weighted risk score
 * 5. Triggers Orange/Red flags
 *
 * SCORING (Renderer Fusion):
 *   final = (0.25 × process) + (0.25 × network) + (0.20 × vpn)
 *         + (0.15 × remote) + (0.15 × correlation)
 *
 *   > 0.70 → RED FLAG
 *   > 0.40 → ORANGE FLAG
 *
 * IMPROVEMENTS OVER v1.0:
 *   - Expandable debug breakdown with all sub-scores
 *   - Mini status indicators for each detection category
 *   - Throughput spike indicator
 *   - Correlation event visualization
 *   - Calibration state display
 *   - Gateway change warning
 *   - Proper cleanup with mounted flag
 */

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────
const WEIGHTS = {
    PROCESS: 0.25,
    NETWORK: 0.25,
    VPN: 0.20,
    REMOTE: 0.15,
    CORRELATION: 0.15,
};

const FLAG_DEBOUNCE_MS = 10000;     // 10s between flags
const CORRELATION_WINDOW_MS = 5 * 60 * 1000;  // 5-minute rolling window
const CORRELATION_DEBOUNCE_MS = 2000;
const CORRELATION_KEYSTROKE_RANGE_MS = 1000; // Network spike within 1s of keystroke = suspicious
const CORRELATION_MAX_EVENTS = 5;

export default function NetworkMonitor({ active, onFlag, hidden = false }) {
    const [riskData, setRiskData] = useState(null);
    const [finalScore, setFinalScore] = useState(0);
    const [correlationScore, setCorrelationScore] = useState(0);
    const [status, setStatus] = useState('initializing'); // initializing | active | unsupported
    const [showDebug, setShowDebug] = useState(false);

    // Refs for correlation tracking
    const lastKeyTimeRef = useRef(0);
    const correlationEventsRef = useRef([]);
    const lastFlagTimeRef = useRef(0);
    const mountedRef = useRef(true);

    // ─ Keystroke-Network Correlation Helper ─
    const recordCorrelationEvent = useCallback(() => {
        const now = Date.now();
        const events = correlationEventsRef.current;
        if (events.length > 0 && (now - events[events.length - 1]) < CORRELATION_DEBOUNCE_MS) return;
        events.push(now);
    }, []);

    const pruneCorrelationEvents = useCallback(() => {
        const cutoff = Date.now() - CORRELATION_WINDOW_MS;
        correlationEventsRef.current = correlationEventsRef.current.filter(t => t > cutoff);
    }, []);

    // ─ Flag Trigger ─
    const triggerFlag = useCallback((data, severity) => {
        const now = Date.now();
        if (now - lastFlagTimeRef.current < FLAG_DEBOUNCE_MS) return;
        lastFlagTimeRef.current = now;

        const violations = [];
        if (data.processRisk?.score > 0) {
            const names = data.processRisk.matches?.slice(0, 3).join(', ') || 'Unknown';
            violations.push(`Blacklisted Process (${names})`);
        }
        if (data.remoteAccess?.score > 0) {
            violations.push(`Remote Control (${data.remoteAccess.detected || 'Active'})`);
        }
        if (data.vpnRisk?.score > 0) {
            if (data.vpnRisk.gatewayChanged) violations.push('Gateway Changed');
            else violations.push('VPN/Proxy Active');
        }
        if (data.networkAnomaly?.score > 0) {
            if (data.networkAnomaly.throughputSpike) violations.push('Traffic Spike');
            else violations.push('Suspicious Ports');
        }
        if (correlationEventsRef.current.length > 2) {
            violations.push('Typing-Network Correlation');
        }

        if (onFlag) {
            onFlag({
                type: 'NETWORK_INTEGRITY',
                message: `System Integrity: ${violations.join(', ') || 'Anomaly Detected'}`,
                severity,
                score: data._finalScore,
                details: {
                    processMatches: data.processRisk?.matches,
                    categories: data.processRisk?.categories,
                    vpnInterface: data.vpnRisk?.interface,
                    remoteDetected: data.remoteAccess?.detected,
                    suspiciousPorts: data.networkAnomaly?.portDetails,
                },
            });
        }
    }, [onFlag]);

    // ─ Main Effect ─
    useEffect(() => {
        if (!active) return;

        mountedRef.current = true;

        // 1. Start Main Process Monitor
        if (window.electronAPI?.startNetworkMonitor) {
            window.electronAPI.startNetworkMonitor();
            setStatus('active');
        } else {
            console.warn('[NetworkMonitor] Electron API not available');
            setStatus('unsupported');
            return;
        }

        // 2. Listen for Risk Updates from Main Process
        const handleUpdate = (data) => {
            if (!mountedRef.current) return;

            // ── Correlation Logic (Renderer Side) ──
            if (data.networkAnomaly?.throughputSpike || data.networkAnomaly?.score > 0.3) {
                const keystrokeAge = Date.now() - lastKeyTimeRef.current;
                if (keystrokeAge < CORRELATION_KEYSTROKE_RANGE_MS && lastKeyTimeRef.current > 0) {
                    recordCorrelationEvent();
                }
            }

            pruneCorrelationEvents();
            const currentCorrelation = Math.min(1.0, correlationEventsRef.current.length / CORRELATION_MAX_EVENTS);
            setCorrelationScore(currentCorrelation);

            // ── Final Score ──
            const pScore = data.processRisk?.score || 0;
            const nScore = data.networkAnomaly?.score || 0;
            const vScore = data.vpnRisk?.score || 0;
            const rScore = data.remoteAccess?.score || 0;

            const computed = (WEIGHTS.PROCESS * pScore) +
                (WEIGHTS.NETWORK * nScore) +
                (WEIGHTS.VPN * vScore) +
                (WEIGHTS.REMOTE * rScore) +
                (WEIGHTS.CORRELATION * currentCorrelation);

            const enriched = { ...data, _finalScore: computed, _correlation: currentCorrelation };
            setRiskData(enriched);
            setFinalScore(computed);

            // ── Flag Check ──
            if (computed > 0.70) {
                triggerFlag(enriched, 'high');
            } else if (computed > 0.40) {
                triggerFlag(enriched, 'medium');
            }
        };

        const removeListener = window.electronAPI.onNetworkRiskUpdate(handleUpdate);

        // 3. Track Keystrokes for Correlation
        const handleKeyDown = () => { lastKeyTimeRef.current = Date.now(); };
        window.addEventListener('keydown', handleKeyDown, { passive: true });

        return () => {
            mountedRef.current = false;
            if (window.electronAPI?.stopNetworkMonitor) window.electronAPI.stopNetworkMonitor();
            removeListener?.();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [active, recordCorrelationEvent, pruneCorrelationEvents, triggerFlag]);

    if (!active) return null;

    // ─ UI Helpers ─
    const getScoreColor = (s) => {
        if (s > 0.70) return 'error';
        if (s > 0.40) return 'warning';
        return 'success';
    };

    const getRiskLabel = (s) => {
        if (s > 0.70) return 'Critical';
        if (s > 0.40) return 'Warning';
        return 'Clean';
    };

    const isCalibrating = riskData?.networkAnomaly?.isCalibrating ?? true;

    // Hidden mode: run all logic but no visible UI
    if (hidden) return null;

    return (
        <Box sx={{
            p: 2,
            transition: 'border-color 0.3s ease',
        }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {status === 'active' ? (
                        <Router color="primary" sx={{ fontSize: 20 }} />
                    ) : (
                        <RouterOutlined color="disabled" sx={{ fontSize: 20 }} />
                    )}
                    <Typography variant="subtitle2" fontWeight={600}>System Monitor</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {isCalibrating && status === 'active' && (
                        <Chip label="Calibrating" size="small" color="info" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                    )}
                    {finalScore > 0.40 && (
                        <Chip
                            label={finalScore > 0.70 ? 'Critical' : 'Warning'}
                            size="small"
                            color={finalScore > 0.70 ? 'error' : 'warning'}
                        />
                    )}
                </Box>
            </Box>

            {status === 'active' && riskData ? (
                <Box>
                    {/* Main Score Bar */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Integrity Score</Typography>
                        <Typography variant="caption" fontWeight={600} color={`${getScoreColor(finalScore)}.main`}>
                            {(finalScore * 100).toFixed(0)}%
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={Math.min(100, finalScore * 100)}
                        color={getScoreColor(finalScore)}
                        sx={{ height: 6, borderRadius: 1, mb: 1 }}
                    />

                    {/* Quick Indicators */}
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                        <MiniIndicator icon={<Dns sx={{ fontSize: 10 }} />} label="Process" value={riskData.processRisk?.score} />
                        <MiniIndicator icon={<Cable sx={{ fontSize: 10 }} />} label="Network" value={riskData.networkAnomaly?.score} />
                        <MiniIndicator icon={<VpnLock sx={{ fontSize: 10 }} />} label="VPN" value={riskData.vpnRisk?.score} />
                        <MiniIndicator icon={<PersonSearch sx={{ fontSize: 10 }} />} label="Remote" value={riskData.remoteAccess?.score} />
                        <MiniIndicator icon={<Keyboard sx={{ fontSize: 10 }} />} label="Correlation" value={correlationScore} />
                    </Box>

                    {/* Active Violations */}
                    {riskData.processRisk?.matches?.length > 0 && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.3, fontSize: 10 }}>
                            ⚠ Process: {riskData.processRisk.matches.slice(0, 2).join(', ')}
                        </Typography>
                    )}
                    {riskData.remoteAccess?.score > 0 && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.3, fontSize: 10 }}>
                            🔴 Remote: {riskData.remoteAccess.detected}
                        </Typography>
                    )}
                    {riskData.vpnRisk?.gatewayChanged && (
                        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 0.3, fontSize: 10 }}>
                            ⚠ Gateway changed during exam
                        </Typography>
                    )}
                    {riskData.networkAnomaly?.throughputSpike && (
                        <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.3, mb: 0.3, fontSize: 10 }}>
                            <TrendingUp sx={{ fontSize: 12 }} /> Traffic spike detected
                        </Typography>
                    )}

                    {/* Expand toggle */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Chip
                            label={getRiskLabel(finalScore)}
                            size="small"
                            color={getScoreColor(finalScore)}
                            variant="outlined"
                        />
                        <Box
                            onClick={() => setShowDebug(!showDebug)}
                            sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                            <Typography variant="caption" color="text.secondary">Details</Typography>
                            {showDebug ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
                        </Box>
                    </Box>

                    {/* Debug Breakdown (collapsible) */}
                    <Collapse in={showDebug}>
                        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
                            <ScoreRow label="Process (25%)" value={riskData.processRisk?.score} />
                            <ScoreRow label="Network (25%)" value={riskData.networkAnomaly?.score} />
                            <ScoreRow label="VPN (20%)" value={riskData.vpnRisk?.score} />
                            <ScoreRow label="Remote (15%)" value={riskData.remoteAccess?.score} />
                            <ScoreRow label="Correlation (15%)" value={correlationScore} />

                            <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="caption" sx={{ fontSize: 9, display: 'block', color: 'text.secondary' }}>
                                    Ports: {riskData.networkAnomaly?.suspiciousPorts || 0} |
                                    Conns: {riskData.networkAnomaly?.establishedCount || 0} |
                                    Spike: {riskData.networkAnomaly?.throughputSpike ? 'Yes' : 'No'}
                                </Typography>
                                <Typography variant="caption" sx={{ fontSize: 9, display: 'block', color: 'text.secondary' }}>
                                    Corr Events: {correlationEventsRef.current.length} |
                                    VPN Iface: {riskData.vpnRisk?.interface || 'None'} |
                                    GW Change: {riskData.vpnRisk?.gatewayChanged ? '⚠' : '✓'}
                                </Typography>
                                {riskData.processRisk?.unknownHighCPU?.length > 0 && (
                                    <Typography variant="caption" sx={{ fontSize: 9, display: 'block', color: 'warning.main' }}>
                                        High CPU: {riskData.processRisk.unknownHighCPU.map(p => `${p.name}(${p.cpu}%)`).join(', ')}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    </Collapse>
                </Box>
            ) : (
                <Typography variant="caption" color="text.secondary">
                    {status === 'unsupported' ? 'System API unavailable (browser mode)' : 'Initializing system monitor...'}
                </Typography>
            )}
        </Box>
    );
}

/**
 * Mini status indicator
 */
function MiniIndicator({ icon, label, value }) {
    const color = value > 0.5 ? 'error.main' : value > 0.2 ? 'warning.main' : 'success.main';
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }} />
            <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary' }}>
                {label}
            </Typography>
        </Box>
    );
}

/**
 * Score row with mini bar
 */
function ScoreRow({ label, value }) {
    const pct = ((value || 0) * 100).toFixed(0);
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 10, width: 100, flexShrink: 0, color: 'text.secondary' }}>
                {label}
            </Typography>
            <Box sx={{ flexGrow: 1, height: 3, bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
                <Box sx={{
                    width: `${pct}%`,
                    height: '100%',
                    bgcolor: value > 0.6 ? 'error.main' : value > 0.3 ? 'warning.main' : 'success.main',
                    borderRadius: 1,
                    transition: 'width 0.3s ease',
                }} />
            </Box>
            <Typography variant="caption" sx={{ fontSize: 10, width: 28, textAlign: 'right', color: 'text.secondary' }}>
                {pct}%
            </Typography>
        </Box>
    );
}

import { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Typography, LinearProgress, Chip, Collapse } from '@mui/material';
import { Mic, MicOff, GraphicEq, ExpandMore, ExpandLess, Tune } from '@mui/icons-material';
import { audioIntelligence } from '../../lib/audioIntelligence';

/**
 * AudioIntelligence UI Component (v2.0)
 *
 * Displays real-time audio intelligence status including:
 * - Calibration progress
 * - Overall speech confidence score
 * - Expandable debug breakdown (5 sub-scores + raw metrics)
 * - Risk level chip
 */
export default function AudioIntelligence({ active, onFlag, stream: sharedStream }) {
    const [status, setStatus] = useState('initializing'); // initializing | calibrating | active | error
    const [scoreData, setScoreData] = useState(null);
    const [showDebug, setShowDebug] = useState(false);
    const streamRef = useRef(null);

    const handleScoreUpdate = useCallback((data) => {
        if (data.isCalibrating) {
            setStatus('calibrating');
        } else {
            setStatus('active');
        }
        setScoreData(data);
    }, []);

    const handleFlag = useCallback((flag) => {
        if (onFlag) onFlag(flag);
    }, [onFlag]);

    useEffect(() => {
        if (!active) return;

        let mounted = true;

        const startService = async () => {
            try {
                let stream;
                if (sharedStream) {
                    // Use audio track from shared stream
                    const audioTrack = sharedStream.getAudioTracks()[0];
                    if (audioTrack) {
                        stream = new MediaStream([audioTrack]);
                    } else {
                        throw new Error('No audio track in shared stream');
                    }
                } else {
                    // Fallback: acquire own stream (ExamSession mode)
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: false,
                            autoGainControl: true,
                            sampleRate: 16000,
                        }
                    });
                }

                if (!mounted) {
                    if (!sharedStream) stream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = stream;
                await audioIntelligence.start(stream, handleScoreUpdate, handleFlag);
            } catch (err) {
                console.error('[AudioIntelligence] Start Failed:', err);
                if (mounted) {
                    setStatus('error');
                    onFlag?.({
                        type: 'MIC_ERROR',
                        message: 'Microphone access failed',
                        severity: 'medium',
                    });
                }
            }
        };

        startService();

        return () => {
            mounted = false;
            audioIntelligence.stop();
            // Only stop tracks if we own them (not shared)
            if (!sharedStream && streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            streamRef.current = null;
        };
    }, [active, sharedStream, handleScoreUpdate, handleFlag]);

    if (!active) return null;

    const score = scoreData?.score ?? 0;
    const scorePercent = (score * 100).toFixed(0);

    const getScoreColor = (s) => {
        if (s > 0.65) return 'error';
        if (s > 0.4) return 'warning';
        return 'success';
    };

    const getRiskLabel = (s) => {
        if (s > 0.65) return 'High Risk';
        if (s > 0.4) return 'Medium';
        return 'Low';
    };

    return (
        <Box sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            width: 300,
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 3,
            p: 2,
            zIndex: 9999,
            border: '1px solid',
            borderColor: score > 0.65 ? 'error.main' : 'divider',
            transition: 'border-color 0.3s ease',
        }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {status === 'active' ? (
                        <GraphicEq color="primary" sx={{ fontSize: 20 }} />
                    ) : status === 'calibrating' ? (
                        <Tune color="info" sx={{ fontSize: 20 }} />
                    ) : status === 'error' ? (
                        <MicOff color="error" sx={{ fontSize: 20 }} />
                    ) : (
                        <Mic color="disabled" sx={{ fontSize: 20 }} />
                    )}
                    <Typography variant="subtitle2" fontWeight={600}>
                        Audio Intelligence
                    </Typography>
                </Box>
                {status === 'active' && score > 0.65 && (
                    <Chip label="High Risk" size="small" color="error" />
                )}
            </Box>

            {/* Status: Calibrating */}
            {status === 'calibrating' && (
                <Box>
                    <Typography variant="caption" color="info.main" sx={{ display: 'block', mb: 0.5 }}>
                        Calibrating ambient noise... ({((scoreData?.calibrationProgress || 0) * 100).toFixed(0)}%)
                    </Typography>
                    <LinearProgress
                        variant="determinate"
                        value={(scoreData?.calibrationProgress || 0) * 100}
                        color="info"
                        sx={{ height: 4, borderRadius: 1 }}
                    />
                </Box>
            )}

            {/* Status: Active */}
            {status === 'active' && scoreData && (
                <Box>
                    {/* Main Score Bar */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Speech Confidence</Typography>
                        <Typography variant="caption" fontWeight={600} color={`${getScoreColor(score)}.main`}>
                            {scorePercent}%
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={Math.min(100, score * 100)}
                        color={getScoreColor(score)}
                        sx={{ height: 6, borderRadius: 1, mb: 1 }}
                    />

                    {/* Risk chip + Expand toggle */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Chip
                            label={getRiskLabel(score)}
                            size="small"
                            color={getScoreColor(score)}
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
                        {scoreData.breakdown && (
                            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
                                <ScoreRow label="VAD (40%)" value={scoreData.breakdown.speechScore} />
                                <ScoreRow label="Near-Field (25%)" value={scoreData.breakdown.nearFieldScore} />
                                <ScoreRow label="Duration (15%)" value={scoreData.breakdown.durationScore} />
                                <ScoreRow label="Repetition (10%)" value={scoreData.breakdown.repetitionScore} />
                                <ScoreRow label="Lip Sync (10%)" value={scoreData.breakdown.lipSyncScore} />

                                <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="caption" sx={{ fontSize: 9, display: 'block', color: 'text.secondary' }}>
                                        RMS: {scoreData.breakdown.volumeRMS?.toFixed(1)} |
                                        VBR: {(scoreData.breakdown.voiceBandRatio * 100)?.toFixed(0)}% |
                                        SFM: {scoreData.breakdown.spectralFlatness?.toFixed(2)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontSize: 9, display: 'block', color: 'text.secondary' }}>
                                        Events: {scoreData.breakdown.speechEventCount} |
                                        Dur: {(scoreData.breakdown.speechDurationMs / 1000)?.toFixed(1)}s |
                                        Cal: {scoreData.breakdown.isCalibrated ? '✓' : '✗'}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Collapse>
                </Box>
            )}

            {/* Status: Error or Initializing */}
            {status === 'initializing' && (
                <Typography variant="caption" color="text.secondary">
                    Initializing AI speech models...
                </Typography>
            )}
            {status === 'error' && (
                <Typography variant="caption" color="error">
                    Microphone unavailable
                </Typography>
            )}
        </Box>
    );
}

/**
 * Helper: Small score row with mini bar
 */
function ScoreRow({ label, value }) {
    const pct = ((value || 0) * 100).toFixed(0);
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 10, width: 95, flexShrink: 0, color: 'text.secondary' }}>
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

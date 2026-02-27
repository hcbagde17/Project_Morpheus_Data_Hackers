import { useEffect, useState, useRef, useCallback } from 'react';
import {
    Box, Typography, LinearProgress, Chip, CircularProgress, Collapse,
} from '@mui/material';
import {
    Visibility, VisibilityOff, ExpandMore, ExpandLess, PeopleAlt, PersonOff,
} from '@mui/icons-material';
import { visionIntelligence } from '../../lib/visionIntelligence';

/**
 * VisionBehaviorMonitor UI Component (v2.0)
 *
 * Displays real-time vision intelligence status:
 * - Model loading progress
 * - Overall suspicion score with color-coded bar
 * - Face detection status (detected / lost / multiple)
 * - Expandable debug breakdown (5 sub-scores + raw metrics)
 * - Mini camera preview (mirrored)
 */
export default function VisionBehaviorMonitor({ active, onFlag, stream: sharedStream }) {
    const [status, setStatus] = useState('initializing'); // initializing | active | error
    const [data, setData] = useState(null);
    const [showDebug, setShowDebug] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    const handleResult = useCallback((result) => {
        setData(result);
    }, []);

    const handleFlag = useCallback((flag) => {
        if (onFlag) onFlag(flag);
    }, [onFlag]);

    useEffect(() => {
        if (!active) return;

        let mounted = true;

        const startService = async () => {
            try {
                await visionIntelligence.initialize();

                if (!mounted) return;

                let stream;
                if (sharedStream) {
                    // Use video track from shared stream
                    const videoTrack = sharedStream.getVideoTracks()[0];
                    if (videoTrack) {
                        stream = new MediaStream([videoTrack]);
                    } else {
                        throw new Error('No video track in shared stream');
                    }
                } else {
                    // Fallback: acquire own stream (ExamSession mode)
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480, frameRate: 15 },
                    });
                }

                if (!mounted) {
                    if (!sharedStream) stream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();

                    visionIntelligence.start(videoRef.current, handleResult, handleFlag);
                    setStatus('active');
                }
            } catch (err) {
                console.error('[VisionBehaviorMonitor] Failed:', err);
                if (mounted) {
                    setStatus('error');
                    onFlag?.({
                        type: 'CAMERA_ERROR',
                        message: 'Camera access failed',
                        severity: 'medium',
                    });
                }
            }
        };

        startService();

        return () => {
            mounted = false;
            visionIntelligence.stop();
            // Only stop tracks if we own them (not shared)
            if (!sharedStream && streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            streamRef.current = null;
        };
    }, [active, sharedStream, handleResult, handleFlag]);

    if (!active) return null;

    const score = data?.score ?? 0;
    const scorePercent = (score * 100).toFixed(0);
    const faceDetected = data?.faceDetected ?? false;
    const faceCount = data?.faceCount ?? 0;
    const faceLost = data?.breakdown?.faceLost ?? false;

    const getScoreColor = (s) => {
        if (s > 0.60) return 'error';
        if (s > 0.3) return 'warning';
        return 'success';
    };

    const getRiskLabel = (s) => {
        if (s > 0.60) return 'High Risk';
        if (s > 0.3) return 'Medium';
        return 'Normal';
    };

    // Face status chip
    const getFaceChip = () => {
        if (faceCount > 1) {
            return <Chip icon={<PeopleAlt sx={{ fontSize: 14 }} />} label={`${faceCount} Faces`} size="small" color="error" />;
        }
        if (faceLost) {
            return <Chip icon={<PersonOff sx={{ fontSize: 14 }} />} label="No Face" size="small" color="warning" variant="outlined" />;
        }
        if (faceDetected) {
            return null; // Normal — no chip needed
        }
        return null;
    };

    return (
        <Box sx={{
            position: 'fixed',
            bottom: 16,
            right: 330, // Positioned left of Audio panel
            width: 280,
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 3,
            p: 2,
            zIndex: 9999,
            border: '1px solid',
            borderColor: score > 0.60 ? 'error.main' : faceLost ? 'warning.main' : 'divider',
            transition: 'border-color 0.3s ease',
        }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {status === 'active' ? (
                        <Visibility color="primary" sx={{ fontSize: 20 }} />
                    ) : status === 'error' ? (
                        <VisibilityOff color="error" sx={{ fontSize: 20 }} />
                    ) : (
                        <Visibility color="disabled" sx={{ fontSize: 20 }} />
                    )}
                    <Typography variant="subtitle2" fontWeight={600}>Vision AI</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {status === 'initializing' && <CircularProgress size={14} />}
                    {getFaceChip()}
                    {status === 'active' && score > 0.60 && (
                        <Chip label="Alert" size="small" color="error" />
                    )}
                </Box>
            </Box>

            {/* Camera Preview */}
            <video
                ref={videoRef}
                style={{
                    width: '100%',
                    height: 110,
                    objectFit: 'cover',
                    borderRadius: 4,
                    marginBottom: 8,
                    transform: 'scaleX(-1)',
                    display: 'block',
                    background: '#111',
                }}
                muted
                playsInline
            />

            {/* Status: Active */}
            {status === 'active' && data ? (
                <Box>
                    {/* Main Score Bar */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Suspicion Score</Typography>
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

                    {/* Quick status indicators */}
                    {data.breakdown && !faceLost && (
                        <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                            <MiniIndicator label="Gaze" value={data.breakdown.gazeScore} />
                            <MiniIndicator label="Pose" value={data.breakdown.poseScore} />
                            <MiniIndicator label="Lips" value={data.breakdown.lipScore} />
                        </Box>
                    )}

                    {/* Face Lost Warning */}
                    {faceLost && data.breakdown?.faceLostMs > 2000 && (
                        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                            ⚠ Face not detected for {(data.breakdown.faceLostMs / 1000).toFixed(0)}s
                        </Typography>
                    )}

                    {/* Expand toggle */}
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
                        {data.breakdown && !faceLost && (
                            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
                                <ScoreRow label="Gaze (35%)" value={data.breakdown.gazeScore} />
                                <ScoreRow label="Pose (25%)" value={data.breakdown.poseScore} />
                                <ScoreRow label="Duration (15%)" value={data.breakdown.durationScore} />
                                <ScoreRow label="Repetition (15%)" value={data.breakdown.repetitionScore} />
                                <ScoreRow label="Lip (10%)" value={data.breakdown.lipScore} />

                                <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="caption" sx={{ fontSize: 9, display: 'block', color: 'text.secondary' }}>
                                        GazeH: {data.breakdown.rawGazeH?.toFixed(2)} |
                                        GazeV: {data.breakdown.rawGazeV?.toFixed(2)} |
                                        Yaw: {data.breakdown.rawYaw?.toFixed(2)} |
                                        Pitch: {data.breakdown.rawPitch?.toFixed(2)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontSize: 9, display: 'block', color: 'text.secondary' }}>
                                        MAR: {data.breakdown.rawMAR?.toFixed(3)} |
                                        Var: {data.breakdown.marVariance?.toFixed(4)} |
                                        Events: {data.breakdown.eventCount} |
                                        Faces: {data.breakdown.faceCount}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Collapse>
                </Box>
            ) : (
                <Typography variant="caption" color="text.secondary">
                    {status === 'error' ? 'Camera unavailable' : 'Loading Vision AI models...'}
                </Typography>
            )}
        </Box>
    );
}

/**
 * Small indicator dot for gaze/pose/lip status
 */
function MiniIndicator({ label, value }) {
    const color = value > 0.5 ? 'error.main' : value > 0.2 ? 'warning.main' : 'success.main';
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }} />
            <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
                {label}
            </Typography>
        </Box>
    );
}

/**
 * Score row with mini bar (reusable)
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

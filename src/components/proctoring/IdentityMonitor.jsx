import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography, Alert } from '@mui/material';
import { Warning } from '@mui/icons-material';
import { supabase } from '../../lib/supabase';
import useAuthStore from '../../store/authStore';

/**
 * IdentityMonitor - Validates face continuously using ArcFace pipeline
 * 
 * Flow:
 * 1. Load user's centroid from DB
 * 2. Every 7 seconds:
 *    a. Detect face (SCRFD)
 *    b. Check Liveness (MiniFASNetV2)
 *    c. Extract Embedding (ArcFace)
 *    d. Compare to Centroid
 * 3. Flag logic on mismatch or missing/spoof
 */

const VERIFY_INTERVAL = 7000;    // ms between checks
const SIMILARITY_THRESHOLD = 0.60; // ArcFace cosine threshold (60% match)
const SPOOF_THRESHOLD = 0.75;      // MiniFASNetV2 spoof probability
const MISMATCH_FOR_FLAG = 3;       // consecutive mismatches → ORANGE
const MISSING_FOR_FLAG = 3;        // consecutive missing → flag
const MULTIPLE_FOR_FLAG = 2;       // consecutive multiple faces → flag

export default function IdentityMonitor({ active, onStatusChange, onLivenessUpdate, embeddingOverride, stream: sharedStream, hidden = false }) {
    const { user } = useAuthStore();
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [centroid, setCentroid] = useState(null);
    const [status, setStatus] = useState('initializing'); // initializing, active, warning, error, legacy
    const [lastSimilarity, setLastSimilarity] = useState(null);
    const [lastSpoof, setLastSpoof] = useState(null);

    // Consecutive violation counters
    const mismatchCount = useRef(0);
    const missingCount = useRef(0);
    const multipleCount = useRef(0);

    const [currentFlagId, setCurrentFlagId] = useState(null);
    const intervalRef = useRef(null);
    const checkingRef = useRef(false);

    // ── Load Centroid ────────────────────────────────────────────────────────

    useEffect(() => {
        if (embeddingOverride) {
            setCentroid(embeddingOverride);
            setStatus('active');
        } else {
            loadCentroid();
        }
    }, [embeddingOverride]);

    const loadCentroid = async () => {
        try {
            const { data, error } = await supabase
                .from('face_registrations')
                .select('centroid_embedding, embedding_version')
                .eq('user_id', user.id)
                .single();

            if (error || !data) {
                console.warn('[IdentityMonitor] No registration found');
                setStatus('active'); // Will just do presence check
                return;
            }

            if (data.embedding_version && !data.embedding_version.startsWith('arcface')) {
                console.warn('[IdentityMonitor] Legacy 128D embedding detected');
                setStatus('legacy');
                return;
            }

            setCentroid(new Float32Array(data.centroid_embedding));
            console.log('[IdentityMonitor] Centroid loaded (512D ArcFace)');
            setStatus('active');
        } catch (err) {
            console.error('[IdentityMonitor] Failed to load centroid:', err);
            setStatus('error');
        }
    };

    // ── Camera Lifecycle ─────────────────────────────────────────────────────

    useEffect(() => {
        if (!active) {
            stopCamera();
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        if (sharedStream) {
            streamRef.current = sharedStream;
            setStream(sharedStream);
        } else {
            startCamera();
        }

        return () => {
            if (!sharedStream) stopCamera();
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [sharedStream, active]);

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => { });
        }
    }, [stream]);

    const startCamera = async () => {
        try {
            const ms = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, frameRate: 15 }
            });
            streamRef.current = ms;
            setStream(ms);
        } catch {
            setStatus('error');
            triggerFlag('DEVICE_ERROR', 'Camera access failed', 'high');
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setStream(null);
    };

    // ── Verification Loop ────────────────────────────────────────────────────

    const verify = useCallback(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2 || status === 'legacy' || checkingRef.current) return;

        checkingRef.current = true;

        try {
            const {
                detectFaces, alignFace, extractEmbedding,
                checkLiveness, cosineSimilarity
            } = await import('../../lib/faceProcessing');

            // 1. Detect faces
            const faces = await detectFaces(videoRef.current);

            // ── Face Missing ─────────────────────────────────────────────────
            if (!faces || faces.length === 0) {
                missingCount.current++;
                mismatchCount.current = 0;
                if (missingCount.current >= MISSING_FOR_FLAG) {
                    triggerFlag('MISSING', 'Student not detected in frame', 'medium');
                }
                setStatus('warning');
                checkingRef.current = false;
                return;
            }
            missingCount.current = 0;

            // ── Multiple Faces ───────────────────────────────────────────────
            if (faces.length > 1) {
                multipleCount.current++;
                if (multipleCount.current >= MULTIPLE_FOR_FLAG) {
                    triggerFlag('MULTIPLE_FACES', `${faces.length} faces detected — possible unauthorized person`, 'high');
                }
                setStatus('warning');
                checkingRef.current = false;
                return;
            }
            multipleCount.current = 0;

            const face = faces[0];
            if (face.score < 0.5) {
                checkingRef.current = false;
                return; // Low confidence detection — skip
            }

            // 2. Align face to 112×112
            const aligned = alignFace(videoRef.current, face.landmarks);

            // 3. Anti-Spoof gate
            const spoofProb = await checkLiveness(aligned);
            setLastSpoof(spoofProb);
            onLivenessUpdate?.({ spoofProb, similarity: null });

            if (spoofProb > SPOOF_THRESHOLD) {
                triggerFlag('SPOOF_DETECTED', `Liveness check failed — possible photo/screen attack (${(spoofProb * 100).toFixed(0)}% spoof probability)`, 'high');
                setStatus('warning');
                checkingRef.current = false;
                return;
            }

            // 4. Extract ArcFace embedding
            if (!centroid) {
                setStatus('active'); // No registration — presence check only
                clearFlag();
                checkingRef.current = false;
                return;
            }

            const embedding = await extractEmbedding(aligned);
            const similarity = cosineSimilarity(centroid, embedding);
            setLastSimilarity(similarity);
            onLivenessUpdate?.({ spoofProb, similarity });

            // 5. Escalation logic
            if (similarity < SIMILARITY_THRESHOLD) {
                mismatchCount.current++;

                // Immediate red flag if spoof + mismatch
                if (spoofProb > 0.5 && similarity < 0.35) {
                    triggerFlag(
                        'IMPERSONATION',
                        `Identity mismatch with spoof indicators (match: ${(similarity * 100).toFixed(0)}%)`,
                        'high'
                    );
                } else if (mismatchCount.current >= MISMATCH_FOR_FLAG) {
                    triggerFlag(
                        'IDENTITY_MISMATCH',
                        `Unrecognized face detected (match: ${(similarity * 100).toFixed(0)}%)`,
                        'high'
                    );
                }
                setStatus('warning');
                checkingRef.current = false;
                return;
            }

            // Match successful
            mismatchCount.current = 0;
            setStatus('active');
            clearFlag();

        } catch (err) {
            console.error('[IdentityMonitor] Verification error:', err);
        }

        checkingRef.current = false;
    }, [centroid, status]);

    useEffect(() => {
        if (!active || status === 'legacy') return;

        intervalRef.current = setInterval(verify, VERIFY_INTERVAL);
        return () => clearInterval(intervalRef.current);
    }, [active, verify, status]);

    // ── Flag Reporting ───────────────────────────────────────────────────────

    const triggerFlag = (type, message, severity) => {
        if (currentFlagId) return; // Already flagged for this session roughly

        const localId = `ID_${Date.now()}`;
        setCurrentFlagId(localId);
        onStatusChange?.({ type, message, severity, localId, module: 'IdentityMonitor' });
    };

    const clearFlag = () => {
        if (currentFlagId) {
            onStatusChange?.({ type: 'RESOLVED', localId: currentFlagId });
            setCurrentFlagId(null);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────

    if (!active) return null;

    // Hidden mode: run all verification logic but render only the hidden video element
    if (hidden) {
        return (
            <video
                ref={videoRef}
                muted
                playsInline
                style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -1 }}
            />
        );
    }

    if (status === 'legacy') {
        return (
            <Alert severity="warning" sx={{ mb: 2 }}>
                Legacy face registration detected. Verification disabled. Please re-register your face from the dashboard before taking exams.
            </Alert>
        );
    }

    return (
        <Box sx={{
            border: theme => `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            p: 2,
            bgcolor: 'background.paper',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <Typography variant="overline" color="text.secondary" fontWeight="bold">
                Identity Monitor (ArcFace 512D)
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Box sx={{
                    width: 120, height: 90, bgcolor: 'black', borderRadius: 1, overflow: 'hidden',
                    position: 'relative'
                }}>
                    <video
                        ref={videoRef}
                        muted
                        playsInline
                        style={{
                            width: '100%', height: '100%', objectFit: 'cover',
                            transform: 'scaleX(-1)'
                        }}
                    />
                </Box>

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <Typography variant="body2" sx={{
                        color: status === 'active' ? 'success.main' :
                            status === 'warning' ? 'error.main' : 'text.secondary',
                        display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'medium'
                    }}>
                        {status === 'active' && '✓ Verified Presence'}
                        {status === 'warning' && <><Warning fontSize="small" /> Verification Issue</>}
                        {status === 'initializing' && 'Initializing AI...'}
                    </Typography>

                    {lastSimilarity !== null && (
                        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 80 }}>
                                Match Score:
                            </Typography>
                            <Box sx={{ flex: 1, height: 4, bgcolor: 'action.hover', borderRadius: 2, overflow: 'hidden' }}>
                                <Box sx={{
                                    width: `${Math.max(0, lastSimilarity) * 100}%`,
                                    height: '100%',
                                    bgcolor: lastSimilarity >= SIMILARITY_THRESHOLD ? '#52c41a' : '#ff4d4f',
                                    transition: 'all 0.3s ease'
                                }} />
                            </Box>
                            <Typography variant="caption" fontWeight="bold">
                                {(lastSimilarity * 100).toFixed(0)}%
                            </Typography>
                        </Box>
                    )}

                    {lastSpoof !== null && (
                        <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 80 }}>
                                Spoof Check:
                            </Typography>
                            <Box sx={{ flex: 1, height: 4, bgcolor: 'action.hover', borderRadius: 2, overflow: 'hidden' }}>
                                <Box sx={{
                                    width: `${lastSpoof * 100}%`,
                                    height: '100%',
                                    bgcolor: lastSpoof > SPOOF_THRESHOLD ? '#ff4d4f' : '#faad14',
                                    transition: 'all 0.3s ease'
                                }} />
                            </Box>
                            <Typography variant="caption" fontWeight="bold">
                                {(lastSpoof * 100).toFixed(0)}%
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
}

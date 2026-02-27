import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Alert } from '@mui/material';
import { Warning } from '@mui/icons-material';
import { supabase } from '../../lib/supabase';
import useAuthStore from '../../store/authStore';

export default function IdentityMonitor({ active, onStatusChange, embeddingOverride, stream: sharedStream, demoMode }) {
    const { user } = useAuthStore();
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [registeredEmbedding, setRegisteredEmbedding] = useState(null);
    const [status, setStatus] = useState('initializing'); // initializing, active, warning, error
    const [warningMsg, setWarningMsg] = useState('');
    const lastCheckTime = useRef(0);
    const [debugInfo, setDebugInfo] = useState('');

    // Load embedding (separate from camera lifecycle)
    useEffect(() => {
        if (embeddingOverride) {
            setRegisteredEmbedding(embeddingOverride);
        } else if (demoMode) {
            // In demo mode, load from localStorage
            try {
                const stored = localStorage.getItem('pw_test_face_embedding');
                if (stored) {
                    setRegisteredEmbedding(JSON.parse(stored));
                    console.log('[IdentityMonitor] Loaded face embedding from localStorage');
                } else {
                    console.warn('[IdentityMonitor] No local face embedding found');
                }
            } catch (err) {
                console.error('[IdentityMonitor] Failed to load local embedding:', err);
            }
        } else {
            loadRegistration();
        }
    }, [embeddingOverride, demoMode]);

    // Camera lifecycle
    useEffect(() => {
        if (sharedStream) {
            // Use shared stream from parent — don't acquire our own
            streamRef.current = sharedStream;
            setStream(sharedStream);
            setStatus('active');
        } else {
            startCamera();
        }
        return () => {
            if (!sharedStream) stopCamera(); // Only stop if we own the stream
        };
    }, [sharedStream]);

    // Connect stream to video element whenever either changes
    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => { });
        }
    }, [stream]);

    const loadRegistration = async () => {
        try {
            const { data, error } = await supabase
                .from('face_registrations')
                .select('embeddings')
                .eq('user_id', user.id)
                .single();

            if (error || !data) {
                console.warn("No face registration found for user");
                return;
            }
            setRegisteredEmbedding(data.embeddings);
        } catch (err) {
            console.error("Failed to load registration", err);
        }
    };

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, frameRate: 15 }
            });
            streamRef.current = mediaStream;
            setStream(mediaStream);
            setStatus('active');
        } catch (err) {
            console.error(err);
            setStatus('error');
            onStatusChange?.({ type: 'DEVICE_ERROR', message: 'Camera access failed' });
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setStream(null);
        }
    };

    // Proctoring Loop
    useEffect(() => {
        if (!active || !stream || !videoRef.current) return;

        let animationId;
        const CHECK_INTERVAL = 2000; // Check every 2 seconds

        // Initialize missing count ref if not exists
        const missingCountRef = { current: 0 };
        const MISSING_THRESHOLD = 3; // Tolerate 3 consecutive checks (approx 6 seconds)

        const checkLoop = async (timestamp) => {
            if (timestamp - lastCheckTime.current >= CHECK_INTERVAL) {
                try {
                    const { detectFaces, extractEmbedding, calculateSimilarity } = await import('../../lib/faceProcessing');

                    if (videoRef.current && videoRef.current.readyState === 4) {
                        const faces = await detectFaces(videoRef.current);

                        // 1. Presence Check
                        if (!faces || faces.length === 0) {
                            missingCountRef.current++;
                            if (missingCountRef.current >= MISSING_THRESHOLD) {
                                handleFlag('MISSING', 'User not detected in frame.', 'high');
                            } else {
                                console.log(`Face missing frame ${missingCountRef.current}/${MISSING_THRESHOLD}`);
                            }
                        }
                        else {
                            missingCountRef.current = 0; // Reset on face found

                            // 2. Multi-Face Check
                            if (faces.length > 1) {
                                handleFlag('MULTIPLE_FACES', 'Multiple people detected in frame.', 'high');
                            }
                            // 3. Identity Check
                            else {
                                const face = faces[0];
                                // Only run recognition if we have a registered embedding
                                if (registeredEmbedding) {
                                    // Extract embedding only if face quality is decent
                                    // Lowered threshold to 0.4 to tolerate mouth opening/expressions
                                    if (face.score > 0.4) {
                                        const currentEmbedding = await extractEmbedding(videoRef.current);
                                        const similarity = calculateSimilarity(registeredEmbedding, currentEmbedding);

                                        setDebugInfo(`Match: ${(similarity * 100).toFixed(1)}%`);

                                        if (similarity < 0.4) {
                                            handleFlag('IMPERSONATION', `Identity verification failed. Match: ${(similarity * 100).toFixed(0)}%`, 'high');
                                        } else {
                                            clearFlag();
                                        }
                                    }
                                } else {
                                    clearFlag(); // No registration, just presence check passed
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.warn("Proctor loop error", err);
                }
                lastCheckTime.current = timestamp;
            }
            animationId = requestAnimationFrame(checkLoop);
        };

        animationId = requestAnimationFrame(checkLoop);
        return () => cancelAnimationFrame(animationId);
    }, [active, stream, registeredEmbedding]);

    const handleFlag = (type, msg, severity) => {
        // Debounce: Only notify if status changed or message changed
        if (status !== 'warning' || warningMsg !== msg) {
            setStatus('warning');
            setWarningMsg(msg);
            onStatusChange?.({ type, message: msg, severity, timestamp: new Date() });
        }
    };

    const clearFlag = () => {
        if (status === 'warning') {
            setStatus('active');
            setWarningMsg('');
            // Optional: notify 'CLEAR' status
        }
    };

    if (!active) return null;

    return (
        <Box sx={{
            position: 'fixed', top: 80, right: 20,
            width: 180, bgcolor: 'background.paper',
            boxShadow: 3, borderRadius: 2, overflow: 'hidden',
            border: status === 'warning' ? '2px solid #ff4d4f' : '1px solid #ddd',
            zIndex: 9999
        }}>
            <Box sx={{ position: 'relative', height: 135, bgcolor: '#000' }}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {status === 'warning' && (
                    <Box sx={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        bgcolor: 'rgba(255, 0, 0, 0.3)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Warning color="error" fontSize="large" />
                    </Box>
                )}
            </Box>
            <Box sx={{ p: 1, bgcolor: status === 'warning' ? '#fff2f0' : '#fff' }}>
                <Typography variant="caption" display="block" color={status === 'warning' ? 'error' : 'text.secondary'} sx={{ lineHeight: 1.2, fontWeight: 600 }}>
                    {status === 'warning' ? warningMsg : 'Proctoring Active'}
                </Typography>
                {/* <Typography variant="caption" sx={{ fontSize: 9, color: '#999' }}>{debugInfo}</Typography> */}
            </Box>
        </Box>
    );
}

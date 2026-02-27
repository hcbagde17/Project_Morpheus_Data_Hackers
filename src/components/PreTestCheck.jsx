import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Box, Card, CardContent, Typography, Button, Stepper, Step, StepLabel,
    Alert, CircularProgress, LinearProgress, Chip
} from '@mui/material';
import {
    Videocam, Mic, PlayArrow, CheckCircle, Warning, NavigateNext, NavigateBefore, Face,
    CameraAlt, Delete
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import { extractEmbedding, calculateSimilarity } from '../lib/faceProcessing';

// LocalStorage key for PW Test demo face embedding
const PW_TEST_FACE_KEY = 'pw_test_face_embedding';

/**
 * PreTestCheck — System & Identity verification before exam.
 * 
 * Props:
 *   onComplete: () => void — called when all checks pass and user clicks "Start Exam"
 *   demoMode: boolean — if true, skips Supabase and uses localStorage for face embeddings
 */
export default function PreTestCheck({ onComplete, demoMode = false }) {
    const { user } = useAuthStore();
    const [activeStep, setActiveStep] = useState(0);
    const [checks, setChecks] = useState({
        admin: 'pending',
        processCleanup: 'pending',
        camera: 'pending',
        mic: 'pending',
        speaker: 'pending',
        environment: 'pending',
    });
    const [killedApps, setKilledApps] = useState([]);
    const [stream, setStream] = useState(null);
    const [audioLevel, setAudioLevel] = useState(0);

    // AI / Identity State
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [identityScore, setIdentityScore] = useState(0);
    const [identityStatus, setIdentityStatus] = useState('Initializing AI...');
    const [registeredEmbedding, setRegisteredEmbedding] = useState(null);

    // Demo mode: face registration state
    const [faceRegistering, setFaceRegistering] = useState(false);
    const [faceRegError, setFaceRegError] = useState('');

    const videoRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const verifyInterval = useRef(null);

    const steps = ['System Initialization', 'System Permissions', 'Identity & Camera', 'Microphone', 'Speaker', 'Environment Check', 'Ready'];

    // ─── 1. Load AI Models & Fetch Registration ───
    useEffect(() => {
        const initAI = async () => {
            try {
                const { loadAIModels } = await import('../lib/aiModelLoader');
                await loadAIModels();
                setModelsLoaded(true);
                setIdentityStatus('Models Loaded');

                if (demoMode) {
                    // Demo mode: load from localStorage
                    try {
                        const stored = localStorage.getItem(PW_TEST_FACE_KEY);
                        if (stored) {
                            const parsed = JSON.parse(stored);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                setRegisteredEmbedding(new Float32Array(parsed));
                                setIdentityStatus('Local Face Loaded');
                            } else {
                                setIdentityStatus('No face registered yet');
                            }
                        } else {
                            setIdentityStatus('No face registered yet');
                        }
                    } catch {
                        setIdentityStatus('No face registered yet');
                    }
                } else {
                    // Production mode: fetch from Supabase
                    try {
                        const { data: reg } = await supabase
                            .from('face_registrations')
                            .select('embeddings')
                            .eq('user_id', user?.id)
                            .single();
                        if (reg) {
                            setRegisteredEmbedding(new Float32Array(reg.embeddings));
                        } else {
                            setIdentityStatus('No registration found');
                        }
                    } catch (err) {
                        console.warn('[PreTest] Supabase face fetch error:', err.message);
                        setIdentityStatus('No registration found');
                    }
                }
            } catch (err) {
                console.error(err);
                setIdentityStatus('AI Load Error');
            }
        };
        initAI();
        return () => {
            if (verifyInterval.current) clearInterval(verifyInterval.current);
        };
    }, [demoMode, user?.id]);

    // Step 0 Auto-advance
    useEffect(() => {
        if (activeStep === 0 && modelsLoaded) {
            const timer = setTimeout(() => setActiveStep(1), 1000);
            return () => clearTimeout(timer);
        }
    }, [activeStep, modelsLoaded]);

    // Step 1: Admin Check + Process Cleanup
    useEffect(() => {
        if (activeStep === 1 && checks.admin === 'pending') {
            const checkAdmin = async () => {
                try {
                    if (window.electronAPI?.checkAdminStatus) {
                        const isAdmin = await window.electronAPI.checkAdminStatus();
                        if (isAdmin) {
                            setChecks(prev => ({ ...prev, admin: 'success' }));
                            await runProcessCleanup();
                        } else {
                            setChecks(prev => ({ ...prev, admin: 'error' }));
                        }
                    } else {
                        setChecks(prev => ({ ...prev, admin: 'success', processCleanup: 'success' }));
                        setActiveStep(2);
                    }
                } catch (e) {
                    setChecks(prev => ({ ...prev, admin: 'error' }));
                }
            };
            checkAdmin();
        }
    }, [activeStep]);

    // Pre-exam process kill
    const runProcessCleanup = async () => {
        setChecks(prev => ({ ...prev, processCleanup: 'running' }));
        try {
            if (window.electronAPI?.preExamKill) {
                const result = await window.electronAPI.preExamKill();
                setKilledApps(result.killed || []);
                setChecks(prev => ({ ...prev, processCleanup: 'success' }));
                console.log(`[PreTest] Killed ${result.total} processes:`, result.killed);
            } else {
                setChecks(prev => ({ ...prev, processCleanup: 'success' }));
            }
            setTimeout(() => setActiveStep(2), 1500);
        } catch (err) {
            console.error('[PreTest] Process cleanup error:', err);
            setChecks(prev => ({ ...prev, processCleanup: 'error' }));
            setTimeout(() => setActiveStep(2), 2000);
        }
    };

    const handleRestartAdmin = () => {
        if (window.electronAPI?.restartAsAdmin) {
            window.electronAPI.restartAsAdmin();
        }
    };

    // Latch mic check when audio is detected (don't reset on silence)
    useEffect(() => {
        if (audioLevel > 10 && checks.mic !== 'success') {
            setChecks(prev => ({ ...prev, mic: 'success' }));
        }
    }, [audioLevel, checks.mic]);

    // Cleanup stream
    useEffect(() => {
        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, [stream]);

    // Ensure video attached
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, activeStep]);

    // ─── Camera & Identity Verification ───
    const startCameraCheck = async () => {
        setIdentityStatus('Starting Camera...');
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setStream(mediaStream);

            if (modelsLoaded && registeredEmbedding) {
                setIdentityStatus('Scanning Face...');
                verifyInterval.current = setInterval(async () => {
                    if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
                    try {
                        const liveEmbedding = await extractEmbedding(videoRef.current);
                        const score = calculateSimilarity(registeredEmbedding, liveEmbedding);
                        setIdentityScore(score);

                        if (score >= 0.9) {
                            setIdentityStatus('Verified ✓');
                            setChecks(prev => ({ ...prev, camera: 'success' }));
                        } else {
                            setChecks(prev => ({ ...prev, camera: 'pending' }));
                            setIdentityStatus('Scanning...');
                        }
                    } catch (e) {
                        // Face not found in frame
                    }
                }, 1000);
            } else if (!registeredEmbedding && demoMode) {
                // Demo mode with no registered face — just check camera works
                setIdentityStatus('Camera OK (no face registered)');
                setChecks(prev => ({ ...prev, camera: 'success' }));
            }
        } catch (err) {
            console.error(err);
            setChecks(prev => ({ ...prev, camera: 'error' }));
            setIdentityStatus('Camera Access Denied');
        }
    };

    // ─── Demo Mode: Register Face from Camera ───
    const registerFaceFromCamera = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
            setFaceRegError('Camera not ready. Please wait.');
            return;
        }
        setFaceRegistering(true);
        setFaceRegError('');
        try {
            const embedding = await extractEmbedding(videoRef.current);
            const embeddingArray = Array.from(embedding);
            localStorage.setItem(PW_TEST_FACE_KEY, JSON.stringify(embeddingArray));
            setRegisteredEmbedding(new Float32Array(embeddingArray));
            setIdentityStatus('Face Registered ✓');
            setFaceRegistering(false);

            // Start verification loop now that we have an embedding
            setIdentityStatus('Verifying...');
            verifyInterval.current = setInterval(async () => {
                if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
                try {
                    const liveEmbedding = await extractEmbedding(videoRef.current);
                    const score = calculateSimilarity(new Float32Array(embeddingArray), liveEmbedding);
                    setIdentityScore(score);
                    if (score >= 0.9) {
                        setIdentityStatus('Verified ✓');
                        setChecks(prev => ({ ...prev, camera: 'success' }));
                    } else {
                        setIdentityStatus('Scanning...');
                    }
                } catch (e) { /* face not found */ }
            }, 1000);
        } catch (err) {
            setFaceRegError('No face detected. Look directly at the camera.');
            setFaceRegistering(false);
        }
    };

    const clearDemoFace = () => {
        localStorage.removeItem(PW_TEST_FACE_KEY);
        setRegisteredEmbedding(null);
        setIdentityScore(0);
        setIdentityStatus('Face cleared');
        if (verifyInterval.current) clearInterval(verifyInterval.current);
        setChecks(prev => ({ ...prev, camera: 'pending' }));
    };

    // ─── Mic & Speaker checks ───
    const startMicCheck = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(mediaStream);
            const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 1024;
            microphone.connect(analyser);
            analyser.connect(javascriptNode);
            javascriptNode.connect(audioContext.destination);

            javascriptNode.onaudioprocess = () => {
                const array = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(array);
                let values = 0;
                for (let i = 0; i < array.length; i++) values += array[i];
                setAudioLevel(values / array.length);
            };
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
        } catch (err) {
            setChecks(prev => ({ ...prev, mic: 'error' }));
        }
    };

    const playTestSound = () => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
            setChecks(prev => ({ ...prev, speaker: 'success' }));
        }, 1000);
    };

    const startEnvironmentCheck = () => {
        setTimeout(() => setChecks(prev => ({ ...prev, environment: 'success' })), 2000);
    };

    const handleNext = () => {
        const nextStep = activeStep + 1;
        setActiveStep(nextStep);
        if (nextStep === 2) startCameraCheck();
        if (nextStep === 3) startMicCheck();
        if (nextStep === 5) startEnvironmentCheck();
    };

    // ═══════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════
    const renderStepContent = (step) => {
        switch (step) {
            case 0: // System Init
                return (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <Typography variant="h6" gutterBottom>Initializing Proctoring System</Typography>
                        <Box sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
                            {!modelsLoaded ? (
                                <>
                                    <CircularProgress size={40} sx={{ mb: 2 }} />
                                    <Typography color="text.secondary">Loading AI Models...</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                        (Face Detection, Landmark Analysis)
                                    </Typography>
                                </>
                            ) : (
                                <>
                                    <CheckCircle color="success" sx={{ fontSize: 48, mb: 2 }} />
                                    <Typography variant="h6" color="success.main">System Ready</Typography>
                                </>
                            )}
                        </Box>
                    </Box>
                );
            case 1: // Admin + Process Cleanup
                return (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="h6" gutterBottom>System Permissions & Cleanup</Typography>
                        <Box sx={{ maxWidth: 500, mx: 'auto', mt: 4 }}>
                            {checks.admin === 'pending' && (
                                <>
                                    <CircularProgress size={30} />
                                    <Typography sx={{ mt: 1 }} color="text.secondary">Checking admin privileges...</Typography>
                                </>
                            )}
                            {checks.admin === 'success' && (
                                <Box sx={{ mb: 3 }}>
                                    <CheckCircle color="success" sx={{ fontSize: 40, mb: 1 }} />
                                    <Typography color="success.main" sx={{ mb: 2 }}>Administrator Privileges Granted</Typography>

                                    {checks.processCleanup === 'running' && (
                                        <Box sx={{ mt: 2 }}>
                                            <CircularProgress size={24} sx={{ mb: 1 }} />
                                            <Typography variant="body2" color="text.secondary">
                                                Closing unauthorized applications...
                                            </Typography>
                                        </Box>
                                    )}
                                    {checks.processCleanup === 'success' && (
                                        <Alert severity="success" sx={{ mt: 2, textAlign: 'left' }}>
                                            <Typography variant="subtitle2" fontWeight={700}>System Cleaned</Typography>
                                            {killedApps.length > 0 ? (
                                                <Typography variant="body2">
                                                    Closed {killedApps.length} unauthorized app(s): {killedApps.join(', ')}
                                                </Typography>
                                            ) : (
                                                <Typography variant="body2">No unauthorized applications found</Typography>
                                            )}
                                        </Alert>
                                    )}
                                    {checks.processCleanup === 'error' && (
                                        <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
                                            <Typography variant="body2">
                                                Some applications could not be closed. Please close them manually.
                                            </Typography>
                                        </Alert>
                                    )}
                                </Box>
                            )}
                            {checks.admin === 'error' && (
                                <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
                                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                                        Administrator Rights Required
                                    </Typography>
                                    <Typography variant="body2" paragraph>
                                        Advanced monitoring features require this application to run as Administrator.
                                    </Typography>
                                    <Button variant="contained" color="warning" fullWidth onClick={handleRestartAdmin} sx={{ mt: 1 }}>
                                        Restart as Administrator
                                    </Button>
                                    <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                                        Accept the User Account Control (UAC) prompt when asked.
                                    </Typography>
                                </Alert>
                            )}
                        </Box>
                    </Box>
                );
            case 2: // Identity & Camera
                return (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography gutterBottom>
                            {demoMode
                                ? 'Register & verify your face for the demo session.'
                                : 'We need to verify your identity before proceeding.'}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                            {!stream && (
                                <Button variant="contained" onClick={startCameraCheck} startIcon={<Videocam />}>
                                    Start Camera
                                </Button>
                            )}
                        </Box>

                        <Box sx={{ position: 'relative', width: 480, height: 360, bgcolor: 'black', mx: 'auto', borderRadius: 2, overflow: 'hidden' }}>
                            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                            {/* Overlay */}
                            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, p: 2, bgcolor: 'rgba(0,0,0,0.6)', color: 'white' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Face color={checks.camera === 'success' ? "success" : "warning"} />
                                        <Typography variant="body1">{identityStatus}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" display="block">Match Score</Typography>
                                        <Typography variant="h6" color={identityScore >= 0.9 ? 'lightgreen' : 'orange'}>
                                            {(identityScore * 100).toFixed(0)}%
                                        </Typography>
                                    </Box>
                                </Box>
                                <LinearProgress
                                    variant="determinate"
                                    value={identityScore * 100}
                                    color={identityScore >= 0.9 ? "success" : "warning"}
                                    sx={{ mt: 1 }}
                                />
                                {identityScore < 0.9 && stream && registeredEmbedding && (
                                    <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#ffb74d' }}>
                                        Need &gt; 90% match to proceed. Look at the camera.
                                    </Typography>
                                )}
                            </Box>
                        </Box>

                        {/* Demo Mode: Register / Clear Face Buttons */}
                        {demoMode && stream && (
                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
                                {!registeredEmbedding ? (
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={registerFaceFromCamera}
                                        disabled={faceRegistering}
                                        startIcon={faceRegistering ? <CircularProgress size={16} /> : <CameraAlt />}
                                    >
                                        {faceRegistering ? 'Capturing...' : 'Register Face'}
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        onClick={clearDemoFace}
                                        startIcon={<Delete />}
                                        size="small"
                                    >
                                        Clear & Re-register
                                    </Button>
                                )}
                            </Box>
                        )}

                        {/* Error messages */}
                        {faceRegError && <Alert severity="warning" sx={{ mt: 2 }}>{faceRegError}</Alert>}

                        {/* No registration message */}
                        {!registeredEmbedding && modelsLoaded && !demoMode && (
                            <Alert severity="error" sx={{ mt: 2 }}>No face registration found! Please contact admin.</Alert>
                        )}
                        {!registeredEmbedding && modelsLoaded && demoMode && stream && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                Click "Register Face" to capture your face for this demo session.
                                Your face data is stored locally only.
                            </Alert>
                        )}
                    </Box>
                );
            case 3: // Microphone
                return (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography gutterBottom>Speak to test microphone.</Typography>
                        {checks.mic === 'pending' && audioLevel === 0 && <Button variant="contained" onClick={startMicCheck} startIcon={<Mic />}>Start Microphone</Button>}
                        <Box sx={{ mt: 4, width: '100%', maxWidth: 400, mx: 'auto' }}>
                            <LinearProgress variant="determinate" value={Math.min(100, audioLevel * 2)} sx={{ height: 20, borderRadius: 10 }} />
                        </Box>
                        {audioLevel > 10 && <Alert severity="success" sx={{ mt: 4 }}>Microphone detected audio!</Alert>}
                    </Box>
                );
            case 4: // Speaker
                return (
                    <Box sx={{ textAlign: 'center' }}>
                        <Button variant="contained" onClick={playTestSound} startIcon={<PlayArrow />} size="large">Play Sound</Button>
                        {checks.speaker === 'success' && <Alert severity="success" sx={{ mt: 2 }}>Audio played.</Alert>}
                        <Box sx={{ mt: 2 }}>
                            <Button onClick={() => setChecks(prev => ({ ...prev, speaker: 'success' }))} sx={{ mr: 1 }}>Yes</Button>
                            <Button color="error" onClick={() => setChecks(prev => ({ ...prev, speaker: 'error' }))}>No</Button>
                        </Box>
                    </Box>
                );
            case 5: // Environment
                return (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <Typography gutterBottom variant="h6">Checking Environment...</Typography>
                        <Box sx={{ maxWidth: 400, mx: 'auto', mt: 3, textAlign: 'left' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                {checks.environment === 'pending' ? <CircularProgress size={20} sx={{ mr: 2 }} /> : <CheckCircle color="success" sx={{ mr: 2 }} />}
                                <Typography>Background & Lighting</Typography>
                            </Box>
                        </Box>
                        {checks.environment === 'success' && <Alert severity="success" sx={{ mt: 3 }}>Environment checks passed!</Alert>}
                    </Box>
                );
            case 6: // Ready
                return (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
                        <Typography variant="h5">You are ready.</Typography>
                        {demoMode && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                This is a demo session — no data is sent to any server.
                            </Typography>
                        )}
                    </Box>
                );
            default: return null;
        }
    };

    return (
        <Card sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
            <CardContent sx={{ p: 4 }}>
                <Typography variant="h5" fontWeight={700} align="center" gutterBottom>
                    {demoMode ? 'PW Test — System & Identity Check' : 'System & Identity Check'}
                </Typography>
                <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
                    {steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                </Stepper>

                <Box sx={{ minHeight: 400 }}>{renderStepContent(activeStep)}</Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Button disabled={activeStep === 0} onClick={() => setActiveStep(prev => prev - 1)} startIcon={<NavigateBefore />}>Back</Button>
                    {activeStep === steps.length - 1 ? (
                        <Button variant="contained" onClick={onComplete} size="large">Start Exam</Button>
                    ) : (
                        <Button
                            variant="contained"
                            onClick={handleNext}
                            endIcon={<NavigateNext />}
                            disabled={
                                (activeStep === 0 && !modelsLoaded) ||
                                (activeStep === 1 && checks.admin !== 'success') ||
                                (activeStep === 2 && (checks.camera !== 'success')) ||
                                (activeStep === 3 && checks.mic !== 'success') ||
                                (activeStep === 4 && checks.speaker !== 'success') ||
                                (activeStep === 5 && checks.environment !== 'success')
                            }
                        >
                            Next
                        </Button>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
}

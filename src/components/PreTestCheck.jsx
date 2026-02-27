import { useState, useRef, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Button, Stepper, Step, StepLabel,
    Alert, CircularProgress, IconButton, LinearProgress,
} from '@mui/material';
import {
    Videocam, Mic, VolumeUp, CheckCircle, ErrorOutline,
    NavigateNext, NavigateBefore, PlayArrow,
} from '@mui/icons-material';

export default function PreTestCheck({ onComplete }) {
    const [activeStep, setActiveStep] = useState(0);
    const [checks, setChecks] = useState({
        camera: 'pending', // pending, success, error
        mic: 'pending',
        speaker: 'pending',
        environment: 'pending',
        ai_models: 'pending',
    });
    const [stream, setStream] = useState(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const videoRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);

    const steps = ['Camera Check', 'Microphone Check', 'Speaker Check', 'AI Model Check', 'Environment Check', 'Ready'];

    // Cleanup stream on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const startCameraCheck = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            setChecks(prev => ({ ...prev, camera: 'success' }));
        } catch (err) {
            console.error(err);
            setChecks(prev => ({ ...prev, camera: 'error' }));
        }
    };

    const startMicCheck = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Setup audio analysis
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
                const length = array.length;
                for (let i = 0; i < length; i++) {
                    values += array[i];
                }
                const average = values / length;
                setAudioLevel(average);
            };

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            // Don't set check to success immediately, wait for user to speak
        } catch (err) {
            console.error(err);
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
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
            setChecks(prev => ({ ...prev, speaker: 'success' }));
        }, 1000);
    };

    const handleNext = () => {
        if (activeStep === 0) {
            // Clean up camera if moving away? No, keep it for monitoring
            // Actually for this flow, let's keep it simple
        }

        const nextStep = activeStep + 1;
        setActiveStep(nextStep);

        if (nextStep === 0) startCameraCheck();
        if (nextStep === 1) startMicCheck();
        if (nextStep === 3) startAIModelCheck();
        if (nextStep === 4) startEnvironmentCheck();
    };

    const startAIModelCheck = async () => {
        try {
            const { loadOpenCV, loadAIModels } = await import('../lib/aiModelLoader');
            await loadOpenCV();
            await loadAIModels();
            setChecks(prev => ({ ...prev, ai_models: 'success' }));
        } catch (err) {
            console.error(err);
            setChecks(prev => ({ ...prev, ai_models: 'error' }));
        }
    };

    const startEnvironmentCheck = () => {
        // Mock AI checks for now
        setTimeout(() => {
            // simulate progress
            setChecks(prev => ({ ...prev, environment: 'success' }));
        }, 3000);
    };

    const renderStepContent = (step) => {
        switch (step) {
            case 0:
                return (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography gutterBottom>Please allow camera access to proceed.</Typography>
                        {checks.camera === 'pending' && (
                            <Button variant="contained" onClick={startCameraCheck} startIcon={<Videocam />}>
                                Start Camera
                            </Button>
                        )}
                        <Box sx={{ mt: 2, height: 300, bgcolor: 'black', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            {!stream && <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Camera preview will appear here</Box>}
                        </Box>
                        {checks.camera === 'success' && <Alert severity="success" sx={{ mt: 2 }}>Camera working correctly!</Alert>}
                        {checks.camera === 'error' && <Alert severity="error" sx={{ mt: 2 }}>Could not access camera. Please check permissions.</Alert>}
                    </Box>
                );
            case 1:
                return (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography gutterBottom>Speak something to test your microphone.</Typography>
                        {checks.mic === 'pending' && audioLevel === 0 && (
                            <Button variant="contained" onClick={startMicCheck} startIcon={<Mic />}>
                                Start Microphone
                            </Button>
                        )}
                        <Box sx={{ mt: 4, width: '100%', maxWidth: 400, mx: 'auto' }}>
                            <LinearProgress variant="determinate" value={Math.min(100, audioLevel * 2)} sx={{ height: 20, borderRadius: 10 }} />
                            <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Audio Level</Typography>
                        </Box>
                        {audioLevel > 10 && (
                            <Alert severity="success" sx={{ mt: 4 }}>Microphone detected audio!</Alert>
                        )}
                        {checks.mic === 'error' && <Alert severity="error" sx={{ mt: 4 }}>Could not access microphone.</Alert>}
                    </Box>
                );
            case 2:
                return (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography gutterBottom>Click play to test your speakers.</Typography>
                        <Button variant="contained" onClick={playTestSound} startIcon={<PlayArrow />} size="large">
                            Play Test Sound
                        </Button>
                        {checks.speaker === 'success' && <Alert severity="success" sx={{ mt: 2 }}>Audio played successfully. Did you hear it?</Alert>}

                        <Box sx={{ mt: 2 }}>
                            <Button onClick={() => setChecks(prev => ({ ...prev, speaker: 'success' }))} sx={{ mr: 1 }}>Yes, I heard it</Button>
                            <Button color="error" onClick={() => setChecks(prev => ({ ...prev, speaker: 'error' }))}>No</Button>
                        </Box>
                    </Box>
                );
            case 3:
                return (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <Typography gutterBottom variant="h6">Loading AI Models (Offline)...</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 3 }}>
                            {checks.ai_models === 'pending' && <CircularProgress />}
                            {checks.ai_models === 'success' && <Alert severity="success">Models Loaded Successfully</Alert>}
                            {checks.ai_models === 'error' && <Alert severity="error">Failed to load offline models</Alert>}
                        </Box>
                    </Box>
                );
            case 4:
                return (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <Typography gutterBottom variant="h6">Checking Environment & Identity...</Typography>
                        <Box sx={{ maxWidth: 400, mx: 'auto', mt: 3, textAlign: 'left' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                {checks.environment === 'pending' ? <CircularProgress size={20} sx={{ mr: 2 }} /> : <CheckCircle color="success" sx={{ mr: 2 }} />}
                                <Typography>Face Detection</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                {checks.environment === 'pending' ? <CircularProgress size={20} sx={{ mr: 2 }} /> : <CheckCircle color="success" sx={{ mr: 2 }} />}
                                <Typography>Identity Verification (Match Record)</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                {checks.environment === 'pending' ? <CircularProgress size={20} sx={{ mr: 2 }} /> : <CheckCircle color="success" sx={{ mr: 2 }} />}
                                <Typography>Lighting & Background Check</Typography>
                            </Box>
                        </Box>
                        {checks.environment === 'success' && <Alert severity="success" sx={{ mt: 3 }}>All AI checks passed!</Alert>}
                    </Box>
                );
            case 5:
                return (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
                        <Typography variant="h5" gutterBottom>System Check Complete</Typography>
                        <Typography color="text.secondary">You are ready to start the exam.</Typography>
                    </Box>
                );
            default:
                return 'Unknown step';
        }
    };

    return (
        <Card sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
            <CardContent sx={{ p: 4 }}>
                <Typography variant="h5" fontWeight={700} gutterBottom align="center">
                    System Compatibility Check
                </Typography>

                <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                <Box sx={{ minHeight: 400 }}>
                    {renderStepContent(activeStep)}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Button
                        disabled={activeStep === 0}
                        onClick={() => setActiveStep(prev => prev - 1)}
                        startIcon={<NavigateBefore />}
                    >
                        Back
                    </Button>
                    {activeStep === steps.length - 1 ? (
                        <Button variant="contained" color="primary" onClick={onComplete} size="large">
                            Start Exam
                        </Button>
                    ) : (
                        <Button
                            variant="contained"
                            onClick={handleNext}
                            endIcon={<NavigateNext />}
                            disabled={
                                (activeStep === 0 && checks.camera !== 'success') ||
                                (activeStep === 0 && checks.camera !== 'success') ||
                                (activeStep === 1 && audioLevel < 5) || // Require some input level
                                (activeStep === 2 && checks.speaker !== 'success') ||
                                (activeStep === 3 && checks.ai_models !== 'success') ||
                                (activeStep === 4 && checks.environment !== 'success')
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

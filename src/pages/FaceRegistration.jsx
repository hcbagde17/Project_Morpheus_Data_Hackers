import { useState, useRef, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Button, Alert, CircularProgress,
    Stepper, Step, StepLabel, Container
} from '@mui/material';
import { Face, CameraAlt, Check } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import { useNavigate } from 'react-router-dom';

import { loadAIModels, getModels } from '../lib/aiModelLoader';

export default function FaceRegistration() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [capturing, setCapturing] = useState(false);
    const [registered, setRegistered] = useState(false);
    const [error, setError] = useState('');
    const [activeStep, setActiveStep] = useState(0);
    const [detection, setDetection] = useState(null); // { bbox, score }
    const [modelsReady, setModelsReady] = useState(false);
    const [modelStatus, setModelStatus] = useState('Loading AI models...');

    const steps = ['Permissions', 'Capture', 'Verification'];

    useEffect(() => {
        initModelsAndCamera();
        return () => stopCamera();
    }, []);

    const initModelsAndCamera = async () => {
        // Load AI models first
        try {
            const models = getModels();
            if (models.detector && models.recognition) {
                setModelsReady(true);
                setModelStatus('');
            } else {
                setModelStatus('Loading face detection models...');
                await loadAIModels();
                setModelsReady(true);
                setModelStatus('');
            }
        } catch (err) {
            console.error('Model loading failed:', err);
            setModelStatus('AI models failed to load — face detection will be skipped');
            // Don't block the flow; face registration can still capture photos
            setModelsReady(true);
        }
        // Then start camera
        await startCamera();
    };

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            setActiveStep(1);
        } catch (err) {
            setError('Could not access camera. Please allow permissions.');
            console.error(err);
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    // Real-time detection loop
    useEffect(() => {
        if (!stream || !videoRef.current || registered || capturing || !modelsReady) return;

        // Check if models actually loaded
        const { detector } = getModels();
        if (!detector) return; // Skip detection if models didn't load

        let animationId;
        let lastRun = 0;
        const FPS_LIMIT = 500; // Run every 500ms to save resources

        const detectLoop = async (timestamp) => {
            if (timestamp - lastRun >= FPS_LIMIT) {
                try {
                    const { detectFaces } = await import('../lib/faceProcessing');
                    if (videoRef.current && videoRef.current.readyState === 4) {
                        const faces = await detectFaces(videoRef.current);
                        drawDetections(faces);
                        setError(faces.length === 0 ? 'No face detected' : faces.length > 1 ? 'Multiple faces detected' : '');
                    }
                } catch (err) {
                    console.warn("Detection loop error", err);
                }
                lastRun = timestamp;
            }
            animationId = requestAnimationFrame(detectLoop);
        };

        animationId = requestAnimationFrame(detectLoop);
        return () => cancelAnimationFrame(animationId);
    }, [stream, registered, capturing, modelsReady]);

    const drawDetections = (faces) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!faces) return;

        faces.forEach(face => {
            const [x1, y1, x2, y2] = face.bbox;
            const w = x2 - x1;
            const h = y2 - y1;

            ctx.strokeStyle = '#00D9FF';
            ctx.lineWidth = 3;
            ctx.strokeRect(x1, y1, w, h);

            // Draw landmarks
            ctx.fillStyle = '#00D9FF';
            face.landmarks.forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt[0], pt[1], 3, 0, 2 * Math.PI);
                ctx.fill();
            });
        });
    };

    const handleCapture = async () => {
        setCapturing(true);
        setError('');
        try {
            const { detectFaces, extractEmbedding } = await import('../lib/faceProcessing');

            // 1. Detect
            const faces = await detectFaces(videoRef.current);
            if (!faces || faces.length === 0) throw new Error("No face detected.");
            if (faces.length > 1) throw new Error("Multiple faces detected. Please be alone.");

            const face = faces[0];

            // 2. Extract Embedding
            const embedding = await extractEmbedding(videoRef.current);

            // 3. Save to Supabase
            const { error: dbError } = await supabase.from('face_registrations').insert({
                user_id: user.id,
                embeddings: Array.from(embedding),
                landmarks: face.landmarks,
                quality_score: face.score
            });

            if (dbError) throw dbError;

            stopCamera();
            setRegistered(true);
            setActiveStep(2);
        } catch (err) {
            console.error(err);
            setError(err.message || "Registration failed.");
        }
        setCapturing(false);
    };

    const handleFinish = () => {
        navigate('/dashboard/student');
    };

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Typography variant="h4" gutterBottom fontWeight={700} align="center">
                Face Registration
            </Typography>

            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
                {steps.map((label) => (
                    <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                    </Step>
                ))}
            </Stepper>

            <Card>
                <CardContent sx={{ p: 4, textAlign: 'center' }}>
                    {!registered ? (
                        <Box>
                            <Typography paragraph>
                                We need to register your face for proctoring verification.
                                Please look directly at the camera in a well-lit room.
                            </Typography>

                            {modelStatus && <Alert severity="info" sx={{ mb: 2 }}>{modelStatus}</Alert>}
                            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                            <Box sx={{
                                width: '100%', maxWidth: 480, height: 360,
                                bgcolor: '#000', mx: 'auto', mb: 3, borderRadius: 2, overflow: 'hidden',
                                position: 'relative'
                            }}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                                />
                                <canvas
                                    ref={canvasRef}
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' }}
                                />

                                {/* Face Overlay Guide */}
                                <Box sx={{
                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                    width: 200, height: 250, border: '2px dashed rgba(255,255,255,0.7)', borderRadius: '50%'
                                }} />
                            </Box>

                            <Button
                                variant="contained"
                                size="large"
                                startIcon={capturing ? <CircularProgress size={20} color="inherit" /> : <CameraAlt />}
                                onClick={handleCapture}
                                disabled={!stream || capturing || (error && (error.includes('No face') || error.includes('Multiple')))}
                            >
                                {capturing ? 'Processing...' : 'Capture Face'}
                            </Button>
                        </Box>
                    ) : (
                        <Box sx={{ py: 4 }}>
                            <Face sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
                            <Typography variant="h5" gutterBottom>Registration Complete!</Typography>
                            <Typography paragraph color="text.secondary">
                                Your face data has been registered successfully.
                            </Typography>
                            <Button variant="contained" onClick={handleFinish} endIcon={<Check />}>
                                Go to Dashboard
                            </Button>
                        </Box>
                    )}
                </CardContent>
            </Card>

            <Alert severity="info" sx={{ mt: 3 }}>
                Note: Biometric data is stored securely and used only for exam identity verification.
            </Alert>
        </Container>
    );
}

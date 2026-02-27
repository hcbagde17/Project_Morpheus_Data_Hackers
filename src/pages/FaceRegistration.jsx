import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Box, Card, CardContent, Typography, Button, Alert, CircularProgress,
    Stepper, Step, StepLabel, Container, LinearProgress, Chip, Stack
} from '@mui/material';
import { Face, CameraAlt, Check, Refresh } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { loadAIModels } from '../lib/aiModelLoader';

const TOTAL_SAMPLES = 12;
const MIN_QUALITY = 0.75;
const ANTI_SPOOF_GATE = 0.4; // reject if spoof > this during registration
const CAPTURE_INTERVAL = 800; // ms between auto-captures

const POSE_PROMPTS = [
    'Look straight at the camera',
    'Slightly turn your head left',
    'Look straight again',
    'Slightly turn your head right',
    'Look straight — blink twice',
];

const steps = ['Setup', 'Anti-Spoof Check', 'Capture Samples', 'Complete'];

export default function FaceRegistration() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    const [activeStep, setActiveStep] = useState(0);
    const [modelsReady, setModelsReady] = useState(false);
    const [stream, setStream] = useState(null);
    const [error, setError] = useState('');
    const [capturedSamples, setCapturedSamples] = useState([]); // Float32Array[]
    const [capturing, setCapturing] = useState(false);
    const [registered, setRegistered] = useState(false);
    const [poseIndex, setPoseIndex] = useState(0);
    const [qualityMsg, setQualityMsg] = useState('');
    const [livenessOk, setLivenessOk] = useState(false);
    const [livenessChecking, setLivenessChecking] = useState(false);

    // ── Init ────────────────────────────────────────────────────────────────

    useEffect(() => {
        init();
        return () => stopCamera();
    }, []);

    const init = async () => {
        try {
            await loadAIModels();
            setModelsReady(true);
        } catch (err) {
            setError('Failed to load face AI models. Please refresh.');
            return;
        }
        await startCamera();
        setActiveStep(1);
    };

    const startCamera = async () => {
        try {
            const ms = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user', frameRate: 15 }
            });
            streamRef.current = ms;
            setStream(ms);
            if (videoRef.current) {
                videoRef.current.srcObject = ms;
            }
        } catch {
            setError('Cannot access camera. Please allow permissions and refresh.');
        }
    };

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => { });
        }
    }, [stream]);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setStream(null);
    };

    // ── Live Detection Overlay ───────────────────────────────────────────────

    useEffect(() => {
        if (!stream || !modelsReady || registered || capturing) return;
        let animId;
        let lastRun = 0;

        const loop = async (ts) => {
            if (ts - lastRun > 200 && videoRef.current && canvasRef.current && videoRef.current.readyState === 4) {
                lastRun = ts;
                try {
                    const { detectFaces } = await import('../lib/faceProcessing');
                    const allFaces = await detectFaces(videoRef.current);

                    // Resize canvas to match actual video resolution
                    const vw = videoRef.current.videoWidth || 640;
                    const vh = videoRef.current.videoHeight || 480;
                    if (canvasRef.current.width !== vw) canvasRef.current.width = vw;
                    if (canvasRef.current.height !== vh) canvasRef.current.height = vh;

                    const ctx = canvasRef.current.getContext('2d');
                    ctx.clearRect(0, 0, vw, vh);

                    if (!allFaces || allFaces.length === 0) {
                        setQualityMsg('No face detected.');
                        return;
                    }

                    // Filter out tiny background faces (must be ≥15% of frame area)
                    const minArea = vw * vh * 0.015; // 1.5% minimum
                    const validFaces = allFaces.filter(f => {
                        const [x1, y1, x2, y2] = f.bbox;
                        return (x2 - x1) * (y2 - y1) >= minArea;
                    });

                    if (validFaces.length === 0) {
                        setQualityMsg('Move closer to the camera.');
                        return;
                    }

                    // Debug log on first detection
                    if (!loop._logged) {
                        loop._logged = true;
                        console.log('[FaceReg Overlay] Detected faces:', validFaces.length,
                            'Primary face landmarks:', validFaces[0].landmarks,
                            'Score:', validFaces[0].score.toFixed(3),
                            'BBox:', validFaces[0].bbox.map(v => v.toFixed(0)));
                    }

                    // Pick the largest face as the primary
                    const primary = validFaces.reduce((best, f) => {
                        const [x1, y1, x2, y2] = f.bbox;
                        const area = (x2 - x1) * (y2 - y1);
                        const [bx1, by1, bx2, by2] = best.bbox;
                        const bestArea = (bx2 - bx1) * (by2 - by1);
                        return area > bestArea ? f : best;
                    });

                    const otherLargeFaces = validFaces.filter(f => f !== primary);

                    if (otherLargeFaces.length > 0) {
                        setQualityMsg(`${validFaces.length} faces detected. Try to be alone.`);
                    } else if (primary.score < MIN_QUALITY) {
                        setQualityMsg('Poor lighting or uncentered face');
                    } else {
                        setQualityMsg('Great! Hold still.');
                    }

                    // Draw bounding box for primary face
                    const [x1, y1, x2, y2] = primary.bbox;
                    ctx.strokeStyle = otherLargeFaces.length > 0 ? '#ff4d4f' :
                        primary.score < MIN_QUALITY ? 'orange' : '#52c41a';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

                    // Draw 5-point landmark dots
                    if (primary.landmarks && primary.landmarks.length >= 5) {
                        const dotColors = ['#00ff88', '#00ff88', '#ffdd00', '#ff6b6b', '#ff6b6b'];
                        primary.landmarks.forEach(([lx, ly], idx) => {
                            ctx.beginPath();
                            ctx.arc(lx, ly, 5, 0, Math.PI * 2);
                            ctx.fillStyle = dotColors[idx] || '#00ff88';
                            ctx.fill();
                            ctx.strokeStyle = 'white';
                            ctx.lineWidth = 2;
                            ctx.stroke();
                        });
                    }
                } catch (e) { }
            }
            animId = requestAnimationFrame(loop);
        };
        animId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animId);
    }, [stream, modelsReady, registered, capturing]);

    // ── Step 2: Anti-Spoof / Liveness Check ─────────────────────────────────

    const runLivenessCheck = async () => {
        setLivenessChecking(true);
        setError('');
        try {
            const { detectFaces, alignFace, checkLiveness } = await import('../lib/faceProcessing');
            if (!videoRef.current || videoRef.current.readyState < 2) throw new Error('Camera not ready');

            const faces = await detectFaces(videoRef.current);
            if (!faces || faces.length === 0) throw new Error('No face detected. Look at the camera.');
            if (faces.length > 1) throw new Error('Multiple faces detected. Please be alone.');
            if (faces[0].score < MIN_QUALITY) throw new Error('Image quality too low. Improve lighting.');

            const aligned = alignFace(videoRef.current, faces[0].landmarks);
            const spoofProb = await checkLiveness(aligned);

            if (spoofProb > ANTI_SPOOF_GATE) {
                throw new Error(`Liveness check failed (${(spoofProb * 100).toFixed(0)}% spoof). Use a real face, not a photo.`);
            }

            setLivenessOk(true);
            setActiveStep(2);
            startAutoCapture();
        } catch (err) {
            setError(err.message);
        }
        setLivenessChecking(false);
    };

    // ── Step 3: Auto Multi-Sample Capture ───────────────────────────────────

    const collectedRef = useRef([]);

    const startAutoCapture = useCallback(() => {
        setCapturing(true);
        setCapturedSamples([]);
        collectedRef.current = [];
        setPoseIndex(0);

        const captureOne = async () => {
            if (collectedRef.current.length >= TOTAL_SAMPLES) {
                setCapturing(false);
                finishRegistration(collectedRef.current);
                return;
            }

            try {
                const { detectFaces, alignFace, extractEmbedding, checkLiveness } = await import('../lib/faceProcessing');
                const faces = await detectFaces(videoRef.current);
                if (faces?.length === 1 && faces[0].score >= MIN_QUALITY) {
                    const aligned = alignFace(videoRef.current, faces[0].landmarks);
                    const spoofProb = await checkLiveness(aligned);

                    if (spoofProb < ANTI_SPOOF_GATE) {
                        const emb = await extractEmbedding(aligned);
                        collectedRef.current.push(emb);
                        setCapturedSamples([...collectedRef.current]);
                    }
                }

                // Advance pose prompt
                const pIdx = Math.floor(collectedRef.current.length / (TOTAL_SAMPLES / POSE_PROMPTS.length));
                setPoseIndex(Math.min(pIdx, POSE_PROMPTS.length - 1));
            } catch { /* skip frame */ }

            if (collectedRef.current.length < TOTAL_SAMPLES) {
                setTimeout(captureOne, CAPTURE_INTERVAL);
            } else {
                setCapturing(false);
                finishRegistration(collectedRef.current);
            }
        };

        captureOne();
    }, []);

    // ── Step 4: Save to Supabase ─────────────────────────────────────────────

    const finishRegistration = async (samples) => {
        if (!samples || samples.length < 5) {
            setError('Not enough quality samples captured. Please retry.');
            setCapturing(false);
            return;
        }
        try {
            const { computeCentroid } = await import('../lib/faceProcessing');
            const centroid = computeCentroid(samples);

            console.log('[FaceReg] Saving centroid to DB. User:', user.id,
                'Centroid length:', centroid.length,
                'Samples:', samples.length);

            // Upsert centroid into face_registrations
            // Only include columns that exist in the table:
            // id, user_id, centroid_embedding, embedding_version, sample_count, updated_at
            const { data: upsertData, error: dbErr } = await supabase
                .from('face_registrations')
                .upsert({
                    user_id: user.id,
                    centroid_embedding: Array.from(centroid),
                    sample_count: samples.length,
                    embedding_version: 'arcface_r50_v1',
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id' })
                .select();

            if (dbErr) {
                console.error('[FaceReg] Upsert error:', dbErr);
                throw dbErr;
            }
            console.log('[FaceReg] ✅ Centroid saved:', upsertData);

            // Batch insert raw samples
            const sampleRows = samples.slice(0, 10).map(s => ({
                user_id: user.id,
                embedding: Array.from(s),
                quality_score: 1.0,
                pose_label: 'auto',
            }));

            await supabase.from('face_embedding_samples').delete().eq('user_id', user.id);
            const { error: sampleErr } = await supabase.from('face_embedding_samples').insert(sampleRows);
            if (sampleErr) console.warn('[FaceReg] Sample insert warning:', sampleErr);

            stopCamera();
            setRegistered(true);
            setActiveStep(3);
        } catch (err) {
            console.error('[FaceReg] ❌ Registration failed:', err);
            setError('Registration failed: ' + (err.message || JSON.stringify(err)));
            setCapturing(false);
        }
    };

    const handleRetry = () => {
        setCapturedSamples([]);
        setCapturing(false);
        setLivenessOk(false);
        setError('');
        setActiveStep(1);
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <Container maxWidth="sm" sx={{ py: 4 }}>
            <Typography variant="h4" fontWeight={700} align="center" gutterBottom>
                Face Registration
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
                ArcFace 512D — Multi-Sample Enrollment
            </Typography>

            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
                {steps.map((label) => (
                    <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                    </Step>
                ))}
            </Stepper>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} action={
                    <Button color="inherit" size="small" onClick={handleRetry}><Refresh /> Retry</Button>
                }>
                    {error}
                </Alert>
            )}

            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                <Box sx={{ position: 'relative', width: '100%', pt: '75%', bgcolor: '#000' }}>

                    {!registered && (
                        <>
                            <video
                                ref={videoRef}
                                muted
                                playsInline
                                style={{
                                    position: 'absolute', top: 0, left: 0,
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    transform: 'scaleX(-1)'
                                }}
                            />
                            <canvas
                                ref={canvasRef}
                                width={640} height={480}
                                style={{
                                    position: 'absolute', top: 0, left: 0,
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    pointerEvents: 'none', transform: 'scaleX(-1)'
                                }}
                            />
                        </>
                    )}

                    {registered && (
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: 'success.light', color: 'success.contrastText' }}>
                            <Check sx={{ fontSize: 64, mb: 2 }} />
                            <Typography variant="h6">Face Registered Successfully</Typography>
                        </Box>
                    )}

                    {!modelsReady && !registered && (
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.7)' }}>
                            <CircularProgress sx={{ color: 'white' }} />
                        </Box>
                    )}
                </Box>

                <CardContent sx={{ textAlign: 'center' }}>
                    {activeStep === 1 && (
                        <>
                            <Typography variant="subtitle1" gutterBottom>
                                {qualityMsg || 'Position your face clearly in view'}
                            </Typography>
                            <Button
                                variant="contained"
                                color="primary"
                                size="large"
                                startIcon={livenessChecking ? <CircularProgress size={20} color="inherit" /> : <Face />}
                                onClick={runLivenessCheck}
                                disabled={livenessChecking || !!error || !modelsReady}
                                fullWidth
                            >
                                {livenessChecking ? 'Checking Liveness...' : 'Start Liveness Check'}
                            </Button>
                        </>
                    )}

                    {activeStep === 2 && capturing && (
                        <>
                            <Typography variant="h6" color="primary.main" gutterBottom>
                                {POSE_PROMPTS[poseIndex]}
                            </Typography>
                            <Box sx={{ mt: 2, mb: 1 }}>
                                <LinearProgress variant="determinate" value={(capturedSamples.length / TOTAL_SAMPLES) * 100} sx={{ height: 10, borderRadius: 5 }} />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                                Captured {capturedSamples.length} / {TOTAL_SAMPLES} quality samples
                            </Typography>
                        </>
                    )}

                    {activeStep === 3 && (
                        <Button
                            variant="contained"
                            color="success"
                            size="large"
                            fullWidth
                            onClick={() => navigate('/dashboard')}
                        >
                            Return to Dashboard
                        </Button>
                    )}
                </CardContent>
            </Card>
        </Container>
    );
}


import { useState, useRef, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Button, Stepper, Step, StepLabel,
    Alert, CircularProgress, LinearProgress,
} from '@mui/material';
import {
    Videocam, Mic, PlayArrow, CheckCircle, Warning
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import { extractEmbedding, calculateSimilarity } from '../lib/faceProcessing';

export default function PreTestCheck({ onComplete }) {
    const { user } = useAuthStore();
    const [activeStep, setActiveStep] = useState(0);
    const [checks, setChecks] = useState({
        camera: 'pending',
        mic: 'pending',
        speaker: 'pending',
        environment: 'pending',
    });
    // New state for combined check
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [identityScore, setIdentityScore] = useState(0);
    const [identityStatus, setIdentityStatus] = useState('Initializing AI...'); // 'pending', 'scanning', 'success', 'fail'
    
    // ... streams and refs ...

    // Load models on mount
    useEffect(() => {
        const loadModels = async () => {
            try {
                const { loadAIModels } = await import('../lib/aiModelLoader');
                await loadAIModels();
                setModelsLoaded(true);
            } catch (e) {
                console.error(e);
                setIdentityStatus('Failed to load AI models');
            }
        };
        loadModels();
    }, []);

    // ... cleanup ...

    // Combined Camera + Identity Check
    const startCameraAndIdentityCheck = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setStream(mediaStream);
            if (videoRef.current) videoRef.current.srcObject = mediaStream;
            
            // Fetch registered embedding
            const { data: reg } = await supabase.from('face_registrations').select('embeddings').eq('user_id', user.id).single();
            if (!reg) {
                 setIdentityStatus('No face registration found');
                 return;
            }
            const registeredEmbedding = new Float32Array(reg.embeddings);

            // Start verification loop if models are loaded
            if (modelsLoaded) {
                startVerificationLoop(registeredEmbedding);
            }
        } catch (err) {
            setChecks(prev => ({...prev, camera: 'error'}));
        }
    };

    const startVerificationLoop = (registeredEmbedding) => {
        const interval = setInterval(async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
            
            try {
                const liveEmbedding = await extractEmbedding(videoRef.current);
                const score = calculateSimilarity(registeredEmbedding, liveEmbedding);
                setIdentityScore(score);
                
                if (score >= 0.9) { // 90% threshold
                    setIdentityStatus('Verified');
                    setChecks(prev => ({...prev, camera: 'success'}));
                    clearInterval(interval); // Stop after success? Or keep checking? 
                    // User might move away before clicking next. 
                    // Let's keep checking but maybe throttle or just leave it as success.
                    // For "Entry", once verified is usually enough, but let's keep it robust.
                    // Actually, if we clear interval, user can change seats. 
                    // But this is just pre-check. Proctoring will run continuously later.
                    // So clearing interval is fine for UI performance.
                } else {
                    setIdentityStatus('Scanning...');
                }
            } catch (e) {
                // Face not found
                setIdentityStatus('Face not detected');
            }
        }, 1000);
        
        // Save interval ref to clear on unmount/step change
    };

    // ...
}

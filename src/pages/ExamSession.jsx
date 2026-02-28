import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Button, Chip, RadioGroup,
    FormControlLabel, Radio, Checkbox, LinearProgress, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, IconButton, Tooltip, Paper,
    Snackbar, Slide,
} from '@mui/material';
import {
    Timer, NavigateBefore, NavigateNext, Flag, Send,
    CheckCircle, Circle, Warning, Error as ErrorIcon, ArrowBack,
    Calculate, Schedule, Wifi, WifiOff,
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

// Pre-test checks
import PreTestCheck from '../components/PreTestCheck';

// Proctoring modules (including IdentityMonitor for student exam)
import IdentityMonitor from '../components/proctoring/IdentityMonitor';
import DeviceMonitor from '../components/proctoring/DeviceMonitor';
import VisionBehaviorMonitor from '../components/proctoring/VisionBehaviorMonitor';
import AudioIntelligence from '../components/proctoring/AudioIntelligence';
import NetworkMonitor from '../components/proctoring/NetworkMonitor';
import ObjectDetection from '../components/proctoring/ObjectDetection';

// Floating panel wrapper for draggable monitors
import FloatingPanel from '../components/FloatingPanel';

// In-app calculator
import ExamCalculator from '../components/ExamCalculator';

// Admin Override panel
import AdminOverridePanel from '../components/AdminOverridePanel';

// Evidence capture & proctoring media service
import { getEvidenceCapture } from '../lib/evidenceCapture';
import { mediaService } from '../lib/proctoringService';

// ─────────────────────────────────────────────
// FLAG SEVERITY HELPERS
// ─────────────────────────────────────────────
const severityMap = { high: 'RED', medium: 'ORANGE', low: 'ORANGE' };

// ─────────────────────────────────────────────
// MAIN COMPONENT — mirrors PWTestSession.jsx exactly
//   Differences from PWTest:
//   - Questions, answers, flags → Supabase DB
//   - Face verification via IdentityMonitor (DB embeddings)
//   - RED flag terminates session immediately
//   - Evidence capture enabled
//   - Waiting screen for scheduled exams
// ─────────────────────────────────────────────
export default function ExamSession() {
    const { testId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuthStore();

    // ─── DB-loaded state ───
    const [test, setTest] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // ─── Exam state (mirrors PWTest) ───
    const [currentQ, setCurrentQ] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [overrideOpen, setOverrideOpen] = useState(false);
    const [disabledModules, setDisabledModules] = useState([]);
    const [preChecksComplete, setPreChecksComplete] = useState(false);
    const [sharedStream, setSharedStream] = useState(null); // ONE stream for all monitors
    const [cameraStream, setCameraStream] = useState(null); // For ObjectDetection / evidence
    const timerRef = useRef(null);
    const clickCountRef = useRef(0);
    const clickTimerRef = useRef(null);
    const evidenceRef = useRef(getEvidenceCapture());

    // ─── Waiting screen state ───
    const [isWaiting, setIsWaiting] = useState(false);
    const [waitRemaining, setWaitRemaining] = useState(0);

    // ─── Online/offline ───
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // ─── Flag state ───
    const [flags, setFlags] = useState([]); // local mirror for UI display
    const [warningMsg, setWarningMsg] = useState('');
    const [warningOpen, setWarningOpen] = useState(false);

    // ─── Calculator state ───
    const [calcOpen, setCalcOpen] = useState(false);

    // ─── Flag Handler (DB + evidence + RED termination) ───
    const logFlag = useCallback(async (flag) => {
        if (!session || submitted) return;
        const dbSeverity = severityMap[flag.severity] || flag.severity;
        const timestamp = new Date().toISOString();

        // Local mirror for UI
        const enrichedFlag = {
            ...flag,
            severity: dbSeverity,
            time: new Date().toLocaleTimeString(),
            id: Date.now() + Math.random(),
        };
        setFlags(prev => [...prev, enrichedFlag]);

        try {
            // Insert flag into DB
            const { data, error: flagErr } = await supabase.from('flags').insert({
                session_id: session.id,
                flag_type: flag.type,
                severity: dbSeverity,
                module: flag.type?.split('_')[0]?.toLowerCase() || 'unknown',
                metadata: { message: flag.message },
                timestamp,
            }).select().single();

            // ── Increment flag counters on exam_sessions immediately ──────────
            // This ensures red_flags / orange_flags are always up-to-date on the
            // session row, visible to parent/teacher/student performance dashboards
            // even for terminated sessions (which never go through submitExam).
            if (!flagErr) {
                const counterField = dbSeverity === 'RED' ? 'red_flags' : dbSeverity === 'ORANGE' ? 'orange_flags' : null;
                if (counterField) {
                    // Fetch current values, increment the right counter + total_flags together
                    const { data: sessionRow } = await supabase
                        .from('exam_sessions')
                        .select('red_flags, orange_flags, total_flags')
                        .eq('id', session.id)
                        .single();
                    if (sessionRow) {
                        await supabase.from('exam_sessions').update({
                            [counterField]: (sessionRow[counterField] || 0) + 1,
                            total_flags: (sessionRow.total_flags || 0) + 1,
                        }).eq('id', session.id);
                    }
                }
            }

            // Capture evidence clip for RED and ORANGE flags
            if (!flagErr && data && (dbSeverity === 'RED' || dbSeverity === 'ORANGE')) {
                evidenceRef.current.captureForFlag(session.id, data.id, 10);
            }

            // Show toast warning
            if (dbSeverity === 'RED' || dbSeverity === 'ORANGE') {
                setWarningMsg(`${dbSeverity} Flag: ${flag.message}`);
                setWarningOpen(true);
            }

            // RED flag → terminate session immediately
            if (dbSeverity === 'RED') {
                console.log('[ExamSession] RED FLAG — terminating session');
                stopAllProctoring();
                await supabase.from('exam_sessions').update({
                    status: 'terminated',
                    ended_at: new Date().toISOString(),
                    score: 0,
                }).eq('id', session.id);
                setSubmitted(true);
                setError('Exam terminated due to severe violation: ' + flag.message);
                if (timerRef.current) clearInterval(timerRef.current);
            }
        } catch (err) {
            console.error('Flag log error', err);
        }

        console.log(`[ExamSession] ${dbSeverity} FLAG: ${flag.message} (${flag.type})`);
    }, [session, submitted]);

    // ─── Stop Backend IPC Services (safe for cleanup, no state changes) ───
    const stopBackendServices = useCallback(() => {
        if (window.electronAPI) {
            window.electronAPI.stopEnforcement();
            window.electronAPI.stopNetworkMonitor();
        }
        // Stop shared stream tracks
        if (sharedStream) {
            sharedStream.getTracks().forEach(t => t.stop());
        }
        // Stop media service & evidence
        mediaService.stop();
        evidenceRef.current.stop();
    }, [sharedStream]);

    // ─── Full Stop (only on submit — disables UI monitors too) ───
    const stopAllProctoring = useCallback(() => {
        console.log('[ExamSession] Stopping ALL Proctoring Services...');
        stopBackendServices();
        setDisabledModules(['identity', 'device', 'behavior', 'audio', 'network', 'object_detection', 'enforcement']);
    }, [stopBackendServices]);

    // ─── Load test metadata only (called on mount, before pre-checks) ───────
    // Does NOT create a session — that happens in loadExam() after pre-checks.
    const loadTestMeta = async () => {
        try {
            const { data: testData, error: testErr } = await supabase
                .from('tests').select('*').eq('id', testId).single();
            if (testErr) throw testErr;
            setTest(testData);
            setTimeLeft(testData.duration_minutes * 60);
        } catch (err) {
            console.error('Failed to load test metadata', err);
            setError(err.message || 'Failed to load test');
        }
        setLoading(false);
    };

    // ─── Load exam from DB (called after pre-checks pass) ────────────────────
    // This is where the exam_sessions INSERT finally happens.
    const loadExam = async () => {
        setLoading(true);
        try {
            // Re-fetch test to ensure fresh data
            const { data: testData, error: testErr } = await supabase
                .from('tests').select('*').eq('id', testId).single();
            if (testErr) throw testErr;
            setTest(testData);
            setTimeLeft(testData.duration_minutes * 60);

            // Fetch questions via junction table
            const { data: qData } = await supabase
                .from('test_questions')
                .select('questions(*)')
                .eq('test_id', testId)
                .order('question_order');
            const flatQuestions = qData?.map(q => q.questions) || [];
            setQuestions(flatQuestions);

            // Find or create session
            let existingSession;
            const { data: sessions } = await supabase
                .from('exam_sessions')
                .select('*')
                .eq('test_id', testId)
                .eq('student_id', user.id)
                .in('status', ['in_progress', 'completed', 'terminated']);

            if (sessions && sessions.length > 0) {
                existingSession = sessions[0];
                if (existingSession.status === 'completed' || existingSession.status === 'terminated') {
                    setSubmitted(true);
                    if (existingSession.status === 'terminated') {
                        setError('This exam was terminated due to proctoring violations.');
                    }
                }
            } else {
                const { data: newSession, error: sessionErr } = await supabase
                    .from('exam_sessions')
                    .insert({
                        test_id: testId,
                        student_id: user.id,
                        status: 'in_progress',
                        started_at: new Date().toISOString(),
                    })
                    .select().single();
                if (sessionErr) {
                    // Duplicate race condition
                    const { data: retry } = await supabase
                        .from('exam_sessions').select('*')
                        .eq('test_id', testId).eq('student_id', user.id)
                        .eq('status', 'in_progress').single();
                    if (retry) {
                        existingSession = retry;
                    } else {
                        throw sessionErr;
                    }
                } else {
                    existingSession = newSession;
                }
            }

            setSession(existingSession);

            // Load any saved answers
            const { data: savedAns } = await supabase
                .from('answers').select('*').eq('session_id', existingSession.id);
            const ansMap = {};
            savedAns?.forEach(a => { ansMap[a.question_id] = a.selected_answer; });
            setAnswers(ansMap);

            // Timer logic — check if waiting
            if (!existingSession.status.match(/completed|terminated/) && testData.start_time) {
                const startTime = new Date(testData.start_time).getTime();
                const now = Date.now();
                if (now < startTime) {
                    setIsWaiting(true);
                    setWaitRemaining(Math.floor((startTime - now) / 1000));
                } else {
                    // Already started — calculate remaining time
                    const elapsed = (now - new Date(existingSession.started_at).getTime()) / 1000;
                    const remaining = Math.max(0, testData.duration_minutes * 60 - elapsed);
                    setTimeLeft(Math.floor(remaining));
                }
            }
        } catch (err) {
            console.error('Failed to load exam', err);
            setError(err.message || 'Failed to load exam');
        }
        setLoading(false);
    };

    // ─── Sync offline answers ───
    const syncOfflineAnswers = async () => {
        if (!navigator.onLine) return;
        try {
            const pending = JSON.parse(localStorage.getItem('pw_offline_answers') || '[]');
            if (pending.length === 0) return;
            const newPending = [];
            for (const ans of pending) {
                const { error } = await supabase.from('answers').upsert(ans, { onConflict: 'session_id,question_id' });
                if (error) newPending.push(ans);
            }
            localStorage.setItem('pw_offline_answers', JSON.stringify(newPending));
            if (newPending.length === 0) console.log('Sync complete');
        } catch (err) { console.error('Sync failed', err); }
    };

    // ─── Load test metadata on mount (NO session created yet) ──────────────
    // Session INSERT is intentionally deferred until after pre-checks pass.
    // This ensures the "Start Exam" button on the dashboard remains visible
    // while the student is going through pre-test checks, and disappears only
    // when they have actually entered the exam from a device.
    useEffect(() => {
        loadTestMeta();
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
            stopBackendServices();
        };
    }, [testId]);

    // ─── Create session + load questions AFTER pre-checks pass ─────────────
    useEffect(() => {
        if (preChecksComplete) {
            loadExam();
        }
    }, [preChecksComplete]);

    // ─── Stop proctoring when submitted ───
    useEffect(() => {
        if (submitted) {
            stopAllProctoring();
        }
    }, [submitted]);

    // ─── Online/offline handling ───
    useEffect(() => {
        const goOnline = () => { setIsOnline(true); syncOfflineAnswers(); };
        const goOffline = () => setIsOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    // ─── Dynamic start/stop backend services based on disabled modules ───
    useEffect(() => {
        if (!preChecksComplete || submitted) return;

        if (window.electronAPI) {
            // Enforcement Service
            if (disabledModules.includes('enforcement')) {
                window.electronAPI.stopEnforcement();
            } else {
                window.electronAPI.startEnforcement();
            }

            // Network Service
            if (disabledModules.includes('network')) {
                window.electronAPI.stopNetworkMonitor();
            } else {
                window.electronAPI.startNetworkMonitor();
            }
        }
    }, [disabledModules, preChecksComplete, submitted]);

    // ─── Start proctoring when PreChecks complete AND not waiting ───
    useEffect(() => {
        if (preChecksComplete && !submitted && !isWaiting && session) {
            console.log('[ExamSession] Exam phase started — mounting monitors. disabledModules:', disabledModules);

            // Start media service for evidence capture
            (async () => {
                try {
                    const stream = await mediaService.start();
                    setCameraStream(mediaService.cameraStream);
                    evidenceRef.current.start(stream);
                    console.log('[ExamSession] Evidence capture started');
                } catch (err) {
                    console.error('[ExamSession] Failed to start media service:', err);
                }
            })();

            // Acquire ONE shared camera+mic stream for all monitors
            (async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480, frameRate: 15 },
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: false,
                            autoGainControl: true,
                        },
                    });
                    setSharedStream(stream);
                    console.log('[ExamSession] Shared media stream acquired (camera + mic)');
                } catch (err) {
                    console.error('[ExamSession] Failed to acquire shared stream:', err);
                }
            })();

            // Start Backend Services (if not disabled)
            if (window.electronAPI) {
                if (!disabledModules.includes('enforcement')) {
                    window.electronAPI.startEnforcement();
                    console.log('[ExamSession] Enforcement started');
                }
                if (!disabledModules.includes('network')) {
                    window.electronAPI.startNetworkMonitor();
                    console.log('[ExamSession] Network monitor started');
                }
            }

            // Start countdown timer
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        handleAutoSubmit();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    }, [preChecksComplete, submitted, isWaiting, session]);

    // ─── Handle Waiting Countdown ───
    useEffect(() => {
        let waitInterval;
        if (isWaiting) {
            waitInterval = setInterval(() => {
                setWaitRemaining(prev => {
                    if (prev <= 1) {
                        clearInterval(waitInterval);
                        setIsWaiting(false);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => { if (waitInterval) clearInterval(waitInterval); };
    }, [isWaiting]);

    // ─── Admin Override Shortcut (Ctrl + Shift + A) ───
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                setOverrideOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Triple-click handler for admin override
    const handleTimerClick = () => {
        clickCountRef.current++;
        if (clickCountRef.current === 1) {
            clickTimerRef.current = setTimeout(() => { clickCountRef.current = 0; }, 800);
        } else if (clickCountRef.current === 3) {
            clickCountRef.current = 0;
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
            setOverrideOpen(true);
        }
    };

    // ─── Answer handler (save to DB + offline fallback) ───
    const handleAnswer = async (questionId, value, isMulti = false) => {
        let newAnswer;
        if (isMulti) {
            const current = answers[questionId] || [];
            newAnswer = current.includes(value)
                ? current.filter(v => v !== value)
                : [...current, value];
        } else {
            newAnswer = [value];
        }
        setAnswers(prev => ({ ...prev, [questionId]: newAnswer }));

        // Save to DB
        if (session) {
            const ansRecord = {
                session_id: session.id,
                question_id: questionId,
                selected_answer: newAnswer,
            };
            try {
                if (navigator.onLine) {
                    await supabase.from('answers').upsert(ansRecord, { onConflict: 'session_id,question_id' });
                } else {
                    const pending = JSON.parse(localStorage.getItem('pw_offline_answers') || '[]');
                    pending.push(ansRecord);
                    localStorage.setItem('pw_offline_answers', JSON.stringify(pending));
                }
            } catch (err) {
                console.error('Answer save error:', err);
                const pending = JSON.parse(localStorage.getItem('pw_offline_answers') || '[]');
                pending.push(ansRecord);
                localStorage.setItem('pw_offline_answers', JSON.stringify(pending));
            }
        }
    };

    // ─── Submit handler ───
    const handleAutoSubmit = async () => {
        await submitExam();
    };

    const submitExam = async () => {
        setSubmitting(true);
        try {
            // Calculate total score
            let totalScore = 0;
            for (const q of questions) {
                const ans = answers[q.id] || [];
                const isCorrect = ans.length > 0 && JSON.stringify([...(q.correct_answer || [])].sort()) === JSON.stringify([...ans].sort());
                totalScore += isCorrect ? q.marks : 0;
            }

            // Query flags
            let red_flags = 0;
            let orange_flags = 0;
            try {
                const { data: flagData } = await supabase
                    .from('flags').select('severity').eq('session_id', session.id);
                flagData?.forEach(f => {
                    if (f.severity === 'RED') red_flags++;
                    if (f.severity === 'ORANGE') orange_flags++;
                });
            } catch (e) { console.warn('Flag count error', e); }

            // Save all answers
            const answerRecords = questions.map(q => ({
                session_id: session.id,
                question_id: q.id,
                selected_answer: answers[q.id] || [],
                is_correct: (answers[q.id]?.length > 0) && JSON.stringify([...(q.correct_answer || [])].sort()) === JSON.stringify([...(answers[q.id] || [])].sort()),
                marks_awarded: ((answers[q.id]?.length > 0) && JSON.stringify([...(q.correct_answer || [])].sort()) === JSON.stringify([...(answers[q.id] || [])].sort())) ? q.marks : 0,
            }));

            await supabase.from('answers').upsert(answerRecords, { onConflict: 'session_id,question_id' });

            // Update session
            await supabase.from('exam_sessions').update({
                status: 'completed',
                ended_at: new Date().toISOString(),
                score: totalScore,
                red_flags,
                orange_flags,
            }).eq('id', session.id);

            stopAllProctoring();
            if (timerRef.current) clearInterval(timerRef.current);
            setSubmitted(true);
            setConfirmSubmit(false);
        } catch (err) {
            console.error('Submit error:', err);
            setError(err.message);
        }
        setSubmitting(false);
    };

    // ─── Format time ───
    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    // ═══════════════════════════════════════════
    // RENDER: Loading
    // ═══════════════════════════════════════════
    if (loading) return <LinearProgress />;
    if (error && !submitted) return <Alert severity="error">{error}</Alert>;
    if (!test) return <Alert severity="error">Test not found</Alert>;

    // ═══════════════════════════════════════════
    // RENDER: Pre-test checks (same as PWTest)
    // ═══════════════════════════════════════════
    if (!preChecksComplete && !submitted) {
        return <PreTestCheck onComplete={() => setPreChecksComplete(true)} />;
    }

    // ═══════════════════════════════════════════
    // RENDER: Waiting Screen (for scheduled exams)
    // ═══════════════════════════════════════════
    if (isWaiting && !submitted) {
        return (
            <Box sx={{ textAlign: 'center', py: 8, maxWidth: 600, mx: 'auto', mt: 4 }}>
                <Card sx={{ borderRadius: 4, boxShadow: '0 8px 32px rgba(108,99,255,0.1)' }}>
                    <CardContent sx={{ p: 6, textAlign: 'center' }}>
                        <Schedule sx={{ fontSize: 64, color: '#6C63FF', mb: 2 }} />
                        <Typography variant="h4" fontWeight={700} gutterBottom>
                            {test.title}
                        </Typography>
                        <Typography color="text.secondary" sx={{ mb: 4, fontSize: '1.1rem' }}>
                            You are early. The exam will start automatically at the scheduled time.
                            Please wait and keep your browser open.
                        </Typography>

                        <Paper sx={{ p: 3, bgcolor: 'rgba(108,99,255,0.05)', display: 'inline-block', borderRadius: 3 }}>
                            <Typography variant="overline" color="primary" fontWeight={700}>
                                Starting In
                            </Typography>
                            <Typography variant="h2" fontWeight={800} color="primary" sx={{ fontFamily: 'monospace' }}>
                                {formatTime(waitRemaining)}
                            </Typography>
                        </Paper>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    // ═══════════════════════════════════════════
    // RENDER: Post-submission / Termination view
    // ═══════════════════════════════════════════
    if (submitted) {
        // Termination view
        if (error) {
            return (
                <Box sx={{ textAlign: 'center', py: 6, maxWidth: 600, mx: 'auto' }}>
                    <ErrorIcon sx={{ fontSize: 72, color: '#FF4D6A', mb: 2 }} />
                    <Typography variant="h4" fontWeight={700} gutterBottom color="error">Exam Terminated</Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>{error}</Typography>
                    <Card><CardContent sx={{ p: 3 }}>
                        <Typography variant="h3" fontWeight={700} color="error">0/{test?.total_marks || 0}</Typography>
                        <Typography color="text.secondary">Score Voided</Typography>
                    </CardContent></Card>
                    <Button variant="contained" sx={{ mt: 3 }} onClick={() => navigate('/dashboard')}
                        startIcon={<ArrowBack />}>Back to Dashboard</Button>
                </Box>
            );
        }

        // Normal submission view
        const totalScore = questions.reduce((acc, q) => {
            const ans = answers[q.id] || [];
            const isCorrect = ans.length > 0 && JSON.stringify([...(q.correct_answer || [])].sort()) === JSON.stringify([...ans].sort());
            return acc + (isCorrect ? q.marks : 0);
        }, 0);

        return (
            <Box sx={{ textAlign: 'center', py: 6, maxWidth: 600, mx: 'auto' }}>
                <CheckCircle sx={{ fontSize: 72, color: '#4ECDC4', mb: 2 }} />
                <Typography variant="h4" fontWeight={700} gutterBottom>Exam Submitted</Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>{test?.title}</Typography>
                <Card><CardContent sx={{ p: 3 }}>
                    <Typography variant="h3" fontWeight={700} color="primary">{totalScore}/{test?.total_marks || 0}</Typography>
                    <Typography color="text.secondary">Your Score</Typography>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
                        <Chip label={`${questions.filter(q => answers[q.id]?.length > 0).length} Answered`} color="success" />
                        <Chip label={`${questions.filter(q => !answers[q.id] || answers[q.id].length === 0).length} Skipped`} variant="outlined" />
                        <Chip label={`${flags.length} Flags`} color={flags.length > 0 ? 'warning' : 'default'} />
                    </Box>

                    {/* Flag Summary */}
                    {flags.length > 0 && (
                        <Box sx={{ mt: 3, textAlign: 'left' }}>
                            <Typography variant="subtitle2" fontWeight={600} gutterBottom>Flags Detected:</Typography>
                            <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                                {flags.map((f, i) => (
                                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                        <Chip
                                            label={f.severity}
                                            size="small"
                                            color={f.severity === 'RED' ? 'error' : 'warning'}
                                            sx={{ width: 70, fontSize: 10 }}
                                        />
                                        <Typography variant="caption">{f.message}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{f.time}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    )}
                </CardContent></Card>
                <Button variant="contained" sx={{ mt: 3 }} onClick={() => navigate('/dashboard')}
                    startIcon={<ArrowBack />}>Back to Dashboard</Button>
            </Box>
        );
    }

    // ═══════════════════════════════════════════
    // RENDER: Active exam view (mirrors PWTest exactly)
    // ═══════════════════════════════════════════
    const currentQuestion = questions[currentQ];
    const answeredCount = questions.filter(q => answers[q.id]?.length > 0).length;
    const isUrgent = timeLeft < 120;

    return (
        <Box sx={{ display: 'flex', gap: 2, height: '100vh', p: 2 }}>
            {/* Main Question Area */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Timer Bar — identical to PWTest */}
                <Paper sx={{
                    p: 1.5, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: isUrgent ? 'rgba(255,77,106,0.1)' : 'rgba(108,99,255,0.06)',
                    border: `1px solid ${isUrgent ? 'rgba(255,77,106,0.3)' : 'rgba(108,99,255,0.15)'}`,
                    cursor: 'pointer',
                }} onClick={handleTimerClick}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{test?.title || 'Exam'}</Typography>
                        {!isOnline && (
                            <Chip icon={<WifiOff />} label="Offline" size="small" color="error" />
                        )}
                        {disabledModules.length > 0 && (
                            <Chip label={`Override: ${disabledModules.length} module(s) disabled`} size="small" color="warning" />
                        )}
                        <Chip label={`${flags.length} flags`} size="small" color={flags.length > 0 ? 'warning' : 'default'} variant="outlined" />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Timer sx={{ color: isUrgent ? '#FF4D6A' : '#6C63FF', fontSize: 20 }} />
                        <Typography variant="h6" fontWeight={700} sx={{ color: isUrgent ? '#FF4D6A' : '#6C63FF', fontFamily: 'monospace' }}>
                            {formatTime(timeLeft)}
                        </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => setOverrideOpen(true)} sx={{ opacity: 0.3, '&:hover': { opacity: 1 } }}>
                        <Warning fontSize="small" />
                    </IconButton>
                </Paper>

                {/* Question Card — identical to PWTest */}
                <Card sx={{ flex: 1, overflow: 'auto' }}><CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Chip label={`Question ${currentQ + 1} of ${questions.length}`} size="small" />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label={`${currentQuestion?.marks} marks`} size="small" color="primary" variant="outlined" />
                            <Tooltip title="Calculator">
                                <IconButton
                                    size="small"
                                    onClick={() => setCalcOpen(true)}
                                    sx={{
                                        bgcolor: 'rgba(108,99,255,0.1)',
                                        '&:hover': { bgcolor: 'rgba(108,99,255,0.2)' },
                                    }}
                                >
                                    <Calculate sx={{ fontSize: 18, color: '#6C63FF' }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    <Typography variant="h6" sx={{ mb: 3, lineHeight: 1.6 }}>
                        {currentQuestion?.question_text}
                    </Typography>

                    {/* Options — MCQ Single */}
                    {currentQuestion?.question_type === 'MCQ_SINGLE' && (
                        <RadioGroup
                            value={answers[currentQuestion.id]?.[0] || ''}
                            onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                        >
                            {currentQuestion.options?.map((opt, i) => (
                                <FormControlLabel key={i} value={opt} control={<Radio />}
                                    label={<Typography variant="body1">{String.fromCharCode(65 + i)}. {opt}</Typography>}
                                    sx={{
                                        mb: 1, p: 1.5, borderRadius: 2, mx: 0,
                                        border: '1px solid',
                                        borderColor: answers[currentQuestion.id]?.[0] === opt ? 'rgba(108,99,255,0.5)' : 'rgba(148,163,184,0.1)',
                                        bgcolor: answers[currentQuestion.id]?.[0] === opt ? 'rgba(108,99,255,0.08)' : 'transparent',
                                        '&:hover': { bgcolor: 'rgba(148,163,184,0.04)' },
                                    }}
                                />
                            ))}
                        </RadioGroup>
                    )}

                    {/* Options — MCQ Multi */}
                    {currentQuestion?.question_type === 'MCQ_MULTI' && (
                        <Box>
                            {currentQuestion.options?.map((opt, i) => (
                                <FormControlLabel key={i}
                                    control={
                                        <Checkbox
                                            checked={(answers[currentQuestion.id] || []).includes(opt)}
                                            onChange={() => handleAnswer(currentQuestion.id, opt, true)}
                                        />
                                    }
                                    label={<Typography variant="body1">{String.fromCharCode(65 + i)}. {opt}</Typography>}
                                    sx={{
                                        display: 'flex', mb: 1, p: 1.5, borderRadius: 2, mx: 0,
                                        border: '1px solid',
                                        borderColor: (answers[currentQuestion.id] || []).includes(opt) ? 'rgba(108,99,255,0.5)' : 'rgba(148,163,184,0.1)',
                                        bgcolor: (answers[currentQuestion.id] || []).includes(opt) ? 'rgba(108,99,255,0.08)' : 'transparent',
                                        '&:hover': { bgcolor: 'rgba(148,163,184,0.04)' },
                                    }}
                                />
                            ))}
                        </Box>
                    )}
                </CardContent></Card>

                {/* Navigation — identical to PWTest */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Button startIcon={<NavigateBefore />} onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                        disabled={currentQ === 0} variant="outlined">Previous</Button>
                    <Button variant="contained" color="warning" onClick={() => setConfirmSubmit(true)}
                        startIcon={<Send />}>Submit Exam</Button>
                    <Button endIcon={<NavigateNext />} onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))}
                        disabled={currentQ === questions.length - 1} variant="outlined">Next</Button>
                </Box>
            </Box>

            {/* Question Palette — identical to PWTest */}
            <Paper sx={{ width: 200, p: 2, flexShrink: 0, overflow: 'auto' }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>Questions</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                    {answeredCount}/{questions.length} answered
                </Typography>
                <LinearProgress variant="determinate" value={(answeredCount / questions.length) * 100} sx={{ mb: 2, borderRadius: 1 }} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                    {questions.map((q, i) => {
                        const isAnswered = answers[q.id]?.length > 0;
                        const isCurrent = i === currentQ;
                        return (
                            <Tooltip key={q.id} title={isAnswered ? 'Answered' : 'Not answered'}>
                                <Box onClick={() => setCurrentQ(i)} sx={{
                                    width: 36, height: 36, borderRadius: 1, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                    border: isCurrent ? '2px solid #6C63FF' : '1px solid rgba(148,163,184,0.2)',
                                    bgcolor: isAnswered ? 'rgba(78,205,196,0.2)' : 'transparent',
                                    color: isAnswered ? '#4ECDC4' : 'text.secondary',
                                    '&:hover': { bgcolor: 'rgba(108,99,255,0.1)' },
                                }}>
                                    {i + 1}
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Box>
                <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'rgba(78,205,196,0.5)' }} />
                        <Typography variant="caption">Answered</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'rgba(148,163,184,0.3)' }} />
                        <Typography variant="caption">Unanswered</Typography>
                    </Box>
                </Box>
            </Paper>

            {/* Submit Confirmation — identical to PWTest */}
            <Dialog open={confirmSubmit} onClose={() => setConfirmSubmit(false)}>
                <DialogTitle>Submit Exam?</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>Are you sure you want to submit?</Typography>
                    <Box sx={{ mt: 1 }}>
                        <Typography variant="body2">Answered: {answeredCount}/{questions.length}</Typography>
                        <Typography variant="body2">Unanswered: {questions.length - answeredCount}</Typography>
                        <Typography variant="body2">Time remaining: {formatTime(timeLeft)}</Typography>
                        <Typography variant="body2">Flags detected: {flags.length}</Typography>
                    </Box>
                    {questions.length - answeredCount > 0 && (
                        <Alert severity="warning" sx={{ mt: 2 }}>You have unanswered questions!</Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmSubmit(false)}>Continue Exam</Button>
                    <Button variant="contained" color="warning" onClick={submitExam} disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Confirm Submit'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Admin Override Panel — same as PWTest */}
            <AdminOverridePanel
                open={overrideOpen}
                onClose={(modules) => {
                    setOverrideOpen(false);
                    if (modules && modules.length > 0) {
                        setDisabledModules(modules);
                    }
                }}
                sessionId={session?.id}
                studentId={user?.id}
            />

            {/* ═══════════════════════════════════════════ */}
            {/* PROCTORING MONITORS — floating & draggable  */}
            {/* (Same layout as PWTest + IdentityMonitor)   */}
            {/* ═══════════════════════════════════════════ */}
            {!submitted && !disabledModules.includes('identity') && sharedStream && (
                <IdentityMonitor active={!submitted} onStatusChange={logFlag} stream={sharedStream} hidden />
            )}
            {!submitted && !disabledModules.includes('device') && (
                <DeviceMonitor active={!submitted} onFlag={logFlag} />
            )}
            {!submitted && !disabledModules.includes('behavior') && sharedStream && (
                <FloatingPanel title="Vision AI" defaultPosition={{ x: window.innerWidth - 310, y: window.innerHeight - 380 }} width={280}>
                    <VisionBehaviorMonitor active={!submitted} onFlag={logFlag} stream={sharedStream} />
                </FloatingPanel>
            )}
            {!submitted && !disabledModules.includes('audio') && sharedStream && (
                <FloatingPanel title="Audio Intelligence" defaultPosition={{ x: window.innerWidth - 330, y: window.innerHeight - 200 }} width={300}>
                    <AudioIntelligence active={!submitted} onFlag={logFlag} stream={sharedStream} />
                </FloatingPanel>
            )}
            {!submitted && !disabledModules.includes('network') && (
                <FloatingPanel title="System Monitor" defaultPosition={{ x: 16, y: window.innerHeight - 300 }} width={280}>
                    <NetworkMonitor active={!submitted} onFlag={logFlag} />
                </FloatingPanel>
            )}
            {!submitted && !disabledModules.includes('object_detection') && cameraStream && (
                <ObjectDetection active={!submitted} stream={cameraStream} onFlag={logFlag} />
            )}

            {/* In-App Calculator */}
            <ExamCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />

            {/* Warning Toast — same as PWTest with Slide transition */}
            <Snackbar
                open={warningOpen}
                autoHideDuration={6000}
                onClose={() => setWarningOpen(false)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                TransitionComponent={Slide}
            >
                <Alert onClose={() => setWarningOpen(false)} severity="warning" sx={{ width: '100%' }}>
                    {warningMsg}
                </Alert>
            </Snackbar>
        </Box>
    );
}

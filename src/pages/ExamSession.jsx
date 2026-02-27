import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Button, Chip, Grid, RadioGroup,
    FormControlLabel, Radio, Checkbox, LinearProgress, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, IconButton, Tooltip, Paper,
} from '@mui/material';
import {
    Timer, NavigateBefore, NavigateNext, Flag, Send,
    CheckCircle, Circle, Warning, Fullscreen, Wifi, WifiOff,
    Schedule
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import AdminOverridePanel from '../components/AdminOverridePanel';
import PreTestCheck from '../components/PreTestCheck';
import IdentityMonitor from '../components/proctoring/IdentityMonitor';
import DeviceMonitor from '../components/proctoring/DeviceMonitor';
import VisionBehaviorMonitor from '../components/proctoring/VisionBehaviorMonitor';
// import BehaviorMonitor from '../components/proctoring/BehaviorMonitor'; // Deprecated
import AudioIntelligence from '../components/proctoring/AudioIntelligence';
import NetworkMonitor from '../components/proctoring/NetworkMonitor';
import ObjectDetection from '../components/proctoring/ObjectDetection';
import { getEvidenceCapture } from '../lib/evidenceCapture';
import { mediaService } from '../lib/proctoringService';
import { Snackbar } from '@mui/material';

export default function ExamSession() {
    const { testId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [test, setTest] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [session, setSession] = useState(null);
    const [currentQ, setCurrentQ] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [overrideOpen, setOverrideOpen] = useState(false);
    const [disabledModules, setDisabledModules] = useState([]);
    const [preChecksComplete, setPreChecksComplete] = useState(false);
    const [isWaiting, setIsWaiting] = useState(false);
    const [waitRemaining, setWaitRemaining] = useState(0);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const timerRef = useRef(null);
    const clickCountRef = useRef(0);
    const clickTimerRef = useRef(null);
    const evidenceRef = useRef(getEvidenceCapture());
    const [warningMsg, setWarningMsg] = useState('');
    const [warningOpen, setWarningOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);

    // Map app severities to DB values
    const severityMap = { high: 'RED', medium: 'ORANGE', low: 'ORANGE' };

    // Shared flag logger with evidence capture
    const logFlag = useCallback(async (flag) => {
        if (!session || submitted) return; // Don't log if already submitted
        const dbSeverity = severityMap[flag.severity] || flag.severity;
        try {
            const { data, error } = await supabase.from('flags').insert({
                session_id: session.id,
                flag_type: flag.type,
                severity: dbSeverity,
                module: flag.type?.split('_')[0]?.toLowerCase() || 'unknown',
                metadata: { message: flag.message },
                timestamp: new Date().toISOString()
            }).select().single();

            // Capture evidence clip for high (RED) and medium (ORANGE) severity flags
            if (!error && data && (dbSeverity === 'RED' || dbSeverity === 'ORANGE')) {
                evidenceRef.current.captureForFlag(session.id, data.id, 10);
            }

            // Warn student on ORANGE flag
            if (dbSeverity === 'ORANGE') {
                setWarningMsg(`Warning: ${flag.message}`);
                setWarningOpen(true);
            }

            // Terminate session immediately on RED flag
            if (dbSeverity === 'RED') {
                await stopAllProctoring(); // Force STOP everything immediately
                await supabase.from('exam_sessions').update({
                    status: 'terminated',
                    ended_at: new Date().toISOString(),
                    score: 0, // Disqualified
                }).eq('id', session.id);

                setSubmitted(true);
                setError('Exam terminated due to severe violation: ' + flag.message);
                // Stop timers
                if (timerRef.current) clearInterval(timerRef.current);
            }
        } catch (err) {
            console.error('Flag log error', err);
        }
    }, [session, submitted]);

    const stopAllProctoring = async () => {
        console.log('Stopping ALL Proctoring Services...');
        // 1. Stop Media & Evidence
        mediaService.stop();
        evidenceRef.current.stop();

        // 2. Stop Backend Services via IPC
        if (window.electronAPI) {
            window.electronAPI.stopEnforcement();
            window.electronAPI.stopNetworkMonitor();
        }

        // 3. Force UI Unmount (by disabling all)
        setDisabledModules(['identity', 'device', 'behavior', 'audio', 'network', 'object_detection', 'enforcement']);
    };

    // Load test and questions
    useEffect(() => {
        loadExam();
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
            stopAllProctoring();
        };
    }, [testId]);

    // Stop Proctoring when Submitted or Terminated
    useEffect(() => {
        if (submitted) {
            stopAllProctoring();
        }
    }, [submitted]);

    // Handle Dynamic Start/Stop of Backend Services based on Disabled List
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

    // Start Proctoring when PreChecks Complete
    useEffect(() => {
        if (preChecksComplete && !submitted && session) {
            const startProctoringSession = async () => {
                try {
                    const stream = await mediaService.start();
                    setCameraStream(mediaService.cameraStream); // Capture camera stream for Object Detection
                    evidenceRef.current.start(stream);

                    // Start Backend Services (if not disabled)
                    if (window.electronAPI) {
                        if (!disabledModules.includes('enforcement')) window.electronAPI.startEnforcement();
                        if (!disabledModules.includes('network')) window.electronAPI.startNetworkMonitor();
                    }

                } catch (err) {
                    console.error('Failed to start proctoring media:', err);
                    setError(`Failed to start screen recording: ${err.message || 'Check permissions'}`);
                }
            };

            // Check if we need to wait
            if (test && test.start_time) {
                const startTime = new Date(test.start_time).getTime();
                const now = Date.now();
                if (now < startTime) {
                    setIsWaiting(true);
                    setWaitRemaining(Math.floor((startTime - now) / 1000));

                    // Don't start proctoring or timer yet if waiting
                    return;
                }
            }

            // Start normally
            startProctoringSession();
        }
    }, [preChecksComplete, submitted, session, test]);

    // Handle Waiting Countdown
    useEffect(() => {
        let waitInterval;
        if (isWaiting) {
            waitInterval = setInterval(() => {
                setWaitRemaining(prev => {
                    if (prev <= 1) {
                        clearInterval(waitInterval);
                        setIsWaiting(false);
                        // Trigger the proctoring start via the other useEffect now that isWaiting is false
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (waitInterval) clearInterval(waitInterval);
        };
    }, [isWaiting]);

    // Admin Override Shortcut (Ctrl + Shift + A)
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

    // Network Status & Sync
    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); syncOfflineAnswers(); };
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const syncOfflineAnswers = async () => {
        try {
            const pending = JSON.parse(localStorage.getItem('pw_offline_answers') || '[]');
            if (pending.length === 0) return;

            // Process sync
            const newPending = [];
            for (const ans of pending) {
                const { error } = await supabase.from('answers').upsert(ans, { onConflict: 'session_id,question_id' });
                if (error) newPending.push(ans);
            }

            localStorage.setItem('pw_offline_answers', JSON.stringify(newPending));
            if (newPending.length === 0) {
                console.log('Sync complete');
            }
        } catch (err) { console.error('Sync failed', err); }
    };

    const loadExam = async () => {
        try {
            // Get test info
            const { data: testData, error: tErr } = await supabase
                .from('tests').select('*, courses(name)').eq('id', testId).single();
            if (tErr) throw tErr;
            setTest(testData);

            // Get questions via junction table
            let { data: qData } = await supabase
                .from('test_questions')
                .select(`
                    question_order,
                    marks,
                    questions (*)
                `)
                .eq('test_id', testId)
                .order('question_order');

            // Flatten structure
            let flatQuestions = qData?.map(item => ({
                ...item.questions,
                marks: item.marks || item.questions.marks, // Override defaults
                question_order: item.question_order
            })) || [];

            // Randomize if enabled
            if (testData.randomize_questions && flatQuestions.length > 0) {
                // Seeded shuffle using session ID or user ID + test ID to ensure consistency on reload
                const seed = session?.id || (user.id + testId);
                flatQuestions = seededShuffle(flatQuestions, seed);
            }

            setQuestions(flatQuestions);

            // Check for existing session
            let { data: existingSession } = await supabase
                .from('exam_sessions').select('*')
                .eq('test_id', testId).eq('student_id', user.id).single();

            if (existingSession && ['completed', 'submitted', 'terminated'].includes(existingSession.status)) {
                setSubmitted(true);
                setSession(existingSession);
                // Load saved answers
                const { data: savedAns } = await supabase
                    .from('answers').select('*').eq('session_id', existingSession.id);
                const ansMap = {};
                savedAns?.forEach(a => { ansMap[a.question_id] = a.selected_answer; });
                setAnswers(ansMap);
                setLoading(false);
                return;
            }

            if (!existingSession) {
                // Create new session
                const { data: newSession, error: sErr } = await supabase.from('exam_sessions').insert({
                    test_id: testId, student_id: user.id, status: 'in_progress',
                    device_info: { userAgent: navigator.userAgent, platform: navigator.platform },
                }).select().single();

                if (sErr) {
                    // If duplicate key error (session exists), fetch it
                    if (sErr.code === '23505') {
                        const { data: retrySession } = await supabase
                            .from('exam_sessions').select('*')
                            .eq('test_id', testId).eq('student_id', user.id).single();
                        existingSession = retrySession;
                    } else {
                        throw sErr;
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

            // ─── Timer Logic Move ───
            // We NO LONGER start the timer here. It's started either when `preChecksComplete && !isWaiting` becomes true OR if the session is already in progress.
            if (!submitted && existingSession && existingSession.status === 'in_progress') {
                const startTime = new Date(testData.start_time).getTime();
                const now = Date.now();

                // If they reload and it's physically before the start time, just set the initial time left
                if (now < startTime) {
                    setTimeLeft(testData.duration_minutes * 60);
                } else {
                    // Timer is started in another effect below if not waiting
                    const elapsed = (now - new Date(existingSession.started_at).getTime()) / 1000;
                    const remaining = Math.max(0, testData.duration_minutes * 60 - elapsed);
                    setTimeLeft(Math.floor(remaining));
                }
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    // Start Exam Timer *after* pre-checks and waiting phase
    useEffect(() => {
        if (preChecksComplete && !isWaiting && !submitted && test && session) {
            // Recalculate time left just in case waiting shifted the start
            const elapsed = (Date.now() - new Date(session.started_at).getTime()) / 1000;
            const remaining = Math.max(0, test.duration_minutes * 60 - elapsed);
            setTimeLeft(Math.floor(remaining));

            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) { clearInterval(timerRef.current); handleAutoSubmit(); return 0; }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [preChecksComplete, isWaiting, submitted, test, session]);

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

    // Save answer to DB
    const saveAnswer = useCallback(async (questionId, selectedAnswer) => {
        if (!session) return;
        const q = questions.find(q => q.id === questionId);
        if (!q) return;
        const isCorrect = JSON.stringify(q.correct_answer.sort()) === JSON.stringify((selectedAnswer || []).sort());
        const marksAwarded = isCorrect ? q.marks : (test?.settings?.negative_marking ? -q.negative_marks : 0);

        const payload = {
            session_id: session.id, question_id: questionId,
            selected_answer: selectedAnswer, is_correct: isCorrect, marks_awarded: marksAwarded,
        };

        // Offline-first save
        try {
            const pending = JSON.parse(localStorage.getItem('pw_offline_answers') || '[]');
            // Update existing if present to avoid dupes
            const idx = pending.findIndex(a => a.session_id === session.id && a.question_id === questionId);
            if (idx >= 0) pending[idx] = payload;
            else pending.push(payload);
            localStorage.setItem('pw_offline_answers', JSON.stringify(pending)); // Save locally first

            if (isOnline) {
                const { error } = await supabase.from('answers').upsert(payload, { onConflict: 'session_id,question_id' });
                if (!error) {
                    // Remove from pending if successful
                    const remaining = JSON.parse(localStorage.getItem('pw_offline_answers') || '[]')
                        .filter(a => !(a.session_id === session.id && a.question_id === questionId));
                    localStorage.setItem('pw_offline_answers', JSON.stringify(remaining));
                } else {
                    throw error;
                }
            }
        } catch (err) {
            console.warn('Saved offline', err);
        }
    }, [session, questions, test, isOnline]);

    const handleAnswer = (questionId, value) => {
        const q = questions.find(q => q.id === questionId);
        let newAnswer;
        if (q.question_type === 'MCQ_SINGLE') {
            newAnswer = [value];
        } else {
            const current = answers[questionId] || [];
            newAnswer = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
        }
        setAnswers(prev => ({ ...prev, [questionId]: newAnswer }));
        saveAnswer(questionId, newAnswer);
    };

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
                const isCorrect = JSON.stringify(q.correct_answer.sort()) === JSON.stringify(ans.sort());
                totalScore += isCorrect ? q.marks : (test?.settings?.negative_marking ? -q.negative_marks : 0);
            }

            // Query flags to compute final flag totals for this session
            let red_flags = 0;
            let orange_flags = 0;
            try {
                const { data: sessionFlags } = await supabase
                    .from('flags')
                    .select('severity')
                    .eq('session_id', session.id);

                if (sessionFlags) {
                    red_flags = sessionFlags.filter(f => f.severity === 'RED').length;
                    orange_flags = sessionFlags.filter(f => f.severity === 'ORANGE').length;
                }
            } catch (flagErr) {
                console.error("Error computing flags during submission:", flagErr);
            }

            // Update session with score and final flag counts
            await supabase.from('exam_sessions').update({
                status: 'submitted', ended_at: new Date().toISOString(),
                score: Math.max(0, totalScore),
                red_flags, orange_flags
            }).eq('id', session.id);

            // Stop Proctoring
            await stopAllProctoring();

            // Audit log
            await supabase.from('audit_logs').insert({
                action: 'EXAM_SUBMITTED', user_id: user.id,
                details: { test_id: testId, score: totalScore, total_marks: test.total_marks },
            });

            if (timerRef.current) clearInterval(timerRef.current);
            setSubmitted(true);
            setConfirmSubmit(false);
        } catch (err) { setError(err.message); }
        setSubmitting(false);
    };

    // Format time
    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    if (loading) return <LinearProgress />;
    if (error) return <Alert severity="error">{error}</Alert>;
    if (!test) return <Alert severity="error">Test not found</Alert>;

    if (!test) return <Alert severity="error">Test not found</Alert>;

    // Pre-test checks
    if (!preChecksComplete && !submitted) {
        return <PreTestCheck onComplete={() => setPreChecksComplete(true)} />;
    }

    // Waiting Screen
    if (isWaiting && !submitted) {
        return (
            <Box sx={{ textAlign: 'center', py: 8, maxWidth: 600, mx: 'auto', mt: 4 }}>
                <Card sx={{ borderRadius: 4, boxShadow: '0 8px 32px rgba(108,99,255,0.1)' }}>
                    <CardContent sx={{ p: 6 }}>
                        <Schedule sx={{ fontSize: 80, color: '#6C63FF', mb: 3 }} />
                        <Typography variant="h4" fontWeight={800} gutterBottom>
                            System Checks Complete!
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

    // Post-submission view
    if (submitted) {
        const totalScore = questions.reduce((acc, q) => {
            const ans = answers[q.id] || [];
            const isCorrect = JSON.stringify(q.correct_answer?.sort()) === JSON.stringify(ans.sort());
            return acc + (isCorrect ? q.marks : 0);
        }, 0);
        return (
            <Box sx={{ textAlign: 'center', py: 6, maxWidth: 500, mx: 'auto' }}>
                <CheckCircle sx={{ fontSize: 72, color: '#4ECDC4', mb: 2 }} />
                <Typography variant="h4" fontWeight={700} gutterBottom>Exam Submitted</Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>{test.title}</Typography>
                <Card><CardContent sx={{ p: 3 }}>
                    <Typography variant="h3" fontWeight={700} color="primary">{totalScore}/{test.total_marks}</Typography>
                    <Typography color="text.secondary">Your Score</Typography>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
                        <Chip label={`${questions.filter(q => answers[q.id]?.length > 0).length} Answered`} color="success" />
                        <Chip label={`${questions.filter(q => !answers[q.id] || answers[q.id].length === 0).length} Skipped`} variant="outlined" />
                    </Box>
                </CardContent></Card>
                <Button variant="contained" sx={{ mt: 3 }} onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
            </Box>
        );
    }

    const currentQuestion = questions[currentQ];
    const answeredCount = questions.filter(q => answers[q.id]?.length > 0).length;
    const isUrgent = timeLeft < 120;

    return (
        <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 140px)' }}>
            {/* Main Question Area */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Timer Bar */}
                <Paper sx={{
                    p: 1.5, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: isUrgent ? 'rgba(255,77,106,0.1)' : 'rgba(108,99,255,0.06)',
                    border: `1px solid ${isUrgent ? 'rgba(255,77,106,0.3)' : 'rgba(108,99,255,0.15)'}`,
                    cursor: 'pointer',
                }} onClick={handleTimerClick}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{test.title} — {test.courses?.name}</Typography>
                        {disabledModules.length > 0 && (
                            <Chip label={`Override: ${disabledModules.length} module(s) disabled`} size="small" color="warning" />
                        )}
                        <Chip
                            icon={isOnline ? <Wifi /> : <WifiOff />}
                            label={isOnline ? 'Online' : 'Offline Mode'}
                            color={isOnline ? 'success' : 'error'}
                            size="small"
                            variant="outlined"
                        />
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

                {/* Question Card */}
                <Card sx={{ flex: 1, overflow: 'auto' }}><CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Chip label={`Question ${currentQ + 1} of ${questions.length}`} size="small" />
                        <Chip label={`${currentQuestion?.marks} marks`} size="small" color="primary" variant="outlined" />
                    </Box>

                    <Typography variant="h6" sx={{ mb: 3, lineHeight: 1.6 }}>
                        {currentQuestion?.question_text}
                    </Typography>

                    {/* Options */}
                    {currentQuestion?.question_type === 'MCQ_SINGLE' ? (
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
                    ) : (
                        currentQuestion?.options?.map((opt, i) => (
                            <FormControlLabel key={i}
                                control={<Checkbox checked={answers[currentQuestion.id]?.includes(opt) || false}
                                    onChange={() => handleAnswer(currentQuestion.id, opt)} />}
                                label={<Typography variant="body1">{String.fromCharCode(65 + i)}. {opt}</Typography>}
                                sx={{
                                    mb: 1, p: 1.5, borderRadius: 2, mx: 0, display: 'flex',
                                    border: '1px solid',
                                    borderColor: answers[currentQuestion.id]?.includes(opt) ? 'rgba(108,99,255,0.5)' : 'rgba(148,163,184,0.1)',
                                    bgcolor: answers[currentQuestion.id]?.includes(opt) ? 'rgba(108,99,255,0.08)' : 'transparent',
                                }}
                            />
                        ))
                    )}
                </CardContent></Card>

                {/* Navigation */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Button startIcon={<NavigateBefore />} onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                        disabled={currentQ === 0} variant="outlined">Previous</Button>
                    <Button variant="contained" color="warning" onClick={() => setConfirmSubmit(true)}
                        startIcon={<Send />}>Submit Exam</Button>
                    <Button endIcon={<NavigateNext />} onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))}
                        disabled={currentQ === questions.length - 1} variant="outlined">Next</Button>
                </Box>
            </Box >

            {/* Question Palette */}
            < Paper sx={{ width: 200, p: 2, flexShrink: 0, overflow: 'auto' }
            }>
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
            </Paper >

            {/* Submit Confirmation */}
            < Dialog open={confirmSubmit} onClose={() => setConfirmSubmit(false)}>
                <DialogTitle>Submit Exam?</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>Are you sure you want to submit?</Typography>
                    <Box sx={{ mt: 1 }}>
                        <Typography variant="body2">Answered: {answeredCount}/{questions.length}</Typography>
                        <Typography variant="body2">Unanswered: {questions.length - answeredCount}</Typography>
                        <Typography variant="body2">Time remaining: {formatTime(timeLeft)}</Typography>
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
            </Dialog >

            {/* Admin Override Panel */}
            < AdminOverridePanel
                open={overrideOpen}
                onClose={(modules) => {
                    setOverrideOpen(false);
                    if (modules && modules.length > 0) {
                        setDisabledModules(modules);
                    }
                }}
                sessionId={session?.id}
            />

            {/* Proctoring Monitors */}
            {
                !submitted && !disabledModules.includes('identity') && (
                    <IdentityMonitor active={!submitted} onStatusChange={logFlag} />
                )
            }
            {
                !submitted && !disabledModules.includes('device') && (
                    <DeviceMonitor active={!submitted} onFlag={logFlag} />
                )
            }
            {
                !submitted && !disabledModules.includes('behavior') && (
                    <VisionBehaviorMonitor active={!submitted} onFlag={logFlag} />
                )
            }
            {
                !submitted && !disabledModules.includes('audio') && (
                    <AudioIntelligence active={!submitted} onFlag={logFlag} />
                )
            }
            {
                !submitted && !disabledModules.includes('network') && (
                    <NetworkMonitor active={!submitted} onFlag={logFlag} />
                )
            }
            {
                !submitted && !disabledModules.includes('object_detection') && cameraStream && (
                    <ObjectDetection active={!submitted} stream={cameraStream} onFlag={logFlag} />
                )
            }

            <Snackbar
                open={warningOpen}
                autoHideDuration={6000}
                onClose={() => setWarningOpen(false)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert onClose={() => setWarningOpen(false)} severity="warning" sx={{ width: '100%' }}>
                    {warningMsg}
                </Alert>
            </Snackbar>
        </Box >
    );
}

// Seeded Shuffle Helper
function seededShuffle(array, seed) {
    // Simple hash function for seeding
    const getHash = (input) => {
        let hash = 0, i, chr;
        const str = String(input);
        if (str.length === 0) return hash;
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash);
    };

    const seedVal = getHash(seed);
    let m = array.length, t, i;

    // Custom random generator
    let state = seedVal;
    const random = () => {
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
    };

    // Fisher-Yates shuffle
    const newArray = [...array];
    while (m) {
        i = Math.floor(Math.abs(random()) * m--);
        t = newArray[m];
        newArray[m] = newArray[i];
        newArray[i] = t;
    }
    return newArray;
}

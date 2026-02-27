import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Button, Chip, RadioGroup,
    FormControlLabel, Radio, LinearProgress, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, IconButton, Tooltip, Paper,
    Snackbar, Slide,
} from '@mui/material';
import {
    Timer, NavigateBefore, NavigateNext, Flag, Send,
    CheckCircle, Circle, Warning, Error as ErrorIcon, ArrowBack,
    Calculate, Security, Face,
} from '@mui/icons-material';

// Pre-test checks (same as student ExamSession)
import PreTestCheck from '../components/PreTestCheck';

// Proctoring modules
import IdentityMonitor from '../components/proctoring/IdentityMonitor';
import DeviceMonitor from '../components/proctoring/DeviceMonitor';
import VisionBehaviorMonitor from '../components/proctoring/VisionBehaviorMonitor';
import AudioIntelligence from '../components/proctoring/AudioIntelligence';
import NetworkMonitor from '../components/proctoring/NetworkMonitor';

// Floating panel wrapper for draggable monitors
import FloatingPanel from '../components/FloatingPanel';

// In-app calculator
import ExamCalculator from '../components/ExamCalculator';

// Admin Override panel (same as ExamSession)
import AdminOverridePanel from '../components/AdminOverridePanel';

// ─────────────────────────────────────────────
// DUMMY MCQ QUESTIONS (demo)
// ─────────────────────────────────────────────
const DEMO_QUESTIONS = [
    {
        id: 'q1', question_text: 'Which data structure uses LIFO (Last In, First Out) ordering?',
        question_type: 'MCQ_SINGLE', options: ['Queue', 'Stack', 'Linked List', 'Hash Map'],
        correct_answer: ['Stack'], marks: 2,
    },
    {
        id: 'q2', question_text: 'What is the time complexity of binary search?',
        question_type: 'MCQ_SINGLE', options: ['O(n)', 'O(n²)', 'O(log n)', 'O(1)'],
        correct_answer: ['O(log n)'], marks: 2,
    },
    {
        id: 'q3', question_text: 'Which of the following is NOT a valid HTTP method?',
        question_type: 'MCQ_SINGLE', options: ['GET', 'POST', 'SEND', 'DELETE'],
        correct_answer: ['SEND'], marks: 2,
    },
    {
        id: 'q4', question_text: 'What does SQL stand for?',
        question_type: 'MCQ_SINGLE',
        options: ['Structured Query Language', 'Simple Query Logic', 'System Question Language', 'Sorted Query List'],
        correct_answer: ['Structured Query Language'], marks: 2,
    },
    {
        id: 'q5', question_text: 'Which sorting algorithm has the best average-case time complexity?',
        question_type: 'MCQ_SINGLE', options: ['Bubble Sort', 'Selection Sort', 'Merge Sort', 'Insertion Sort'],
        correct_answer: ['Merge Sort'], marks: 2,
    },
    {
        id: 'q6', question_text: 'What is the purpose of DNS?',
        question_type: 'MCQ_SINGLE',
        options: ['Encrypt data', 'Translate domain names to IPs', 'Store cookies', 'Manage sessions'],
        correct_answer: ['Translate domain names to IPs'], marks: 2,
    },
    {
        id: 'q7', question_text: 'Which language is primarily used for styling web pages?',
        question_type: 'MCQ_SINGLE', options: ['HTML', 'JavaScript', 'CSS', 'Python'],
        correct_answer: ['CSS'], marks: 2,
    },
    {
        id: 'q8', question_text: 'In React, what hook is used for side effects?',
        question_type: 'MCQ_SINGLE', options: ['useState', 'useEffect', 'useReducer', 'useMemo'],
        correct_answer: ['useEffect'], marks: 2,
    },
];

const DEMO_DURATION_MINUTES = 30;
const DEMO_TEST = { title: 'PW Demo Test', total_marks: 16 };

// ─────────────────────────────────────────────
// FLAG SEVERITY HELPERS
// ─────────────────────────────────────────────
const severityMap = { high: 'RED', medium: 'ORANGE', low: 'ORANGE' };

// ─────────────────────────────────────────────
// MAIN COMPONENT — mirrors ExamSession.jsx exactly
//   Differences:
//   - No server/supabase — all local
//   - Flags show as toast notifications, never terminate
//   - Alt-tab allowed (flagged but not blocked)
//   - No evidence capture / video recording
//   - Face verification via localStorage
// ─────────────────────────────────────────────
export default function PWTestSession() {
    const navigate = useNavigate();
    const questions = DEMO_QUESTIONS;

    // State — mirrors ExamSession
    const [currentQ, setCurrentQ] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(DEMO_DURATION_MINUTES * 60);
    const [submitted, setSubmitted] = useState(false);
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [overrideOpen, setOverrideOpen] = useState(false);
    const [disabledModules, setDisabledModules] = useState([]);
    const [preChecksComplete, setPreChecksComplete] = useState(false);
    const [sharedStream, setSharedStream] = useState(null); // ONE stream for all monitors
    const timerRef = useRef(null);
    const clickCountRef = useRef(0);
    const clickTimerRef = useRef(null);

    // Flag state — local only
    const [flags, setFlags] = useState([]);
    const [warningMsg, setWarningMsg] = useState('');
    const [warningOpen, setWarningOpen] = useState(false);

    // Calculator state
    const [calcOpen, setCalcOpen] = useState(false);

    // ─── Liveness / Spoof state (from IdentityMonitor) ───
    const [livenessData, setLivenessData] = useState({ spoofProb: null, similarity: null });

    const handleLivenessUpdate = useCallback(({ spoofProb, similarity }) => {
        setLivenessData(prev => ({
            spoofProb: spoofProb ?? prev.spoofProb,
            similarity: similarity ?? prev.similarity,
        }));
    }, []);

    // ─── Flag Handler (local only — NO database, NO evidence, NO termination) ───
    const logFlag = useCallback((flag) => {
        if (submitted) return;
        const dbSeverity = severityMap[flag.severity] || flag.severity;
        const timestamp = new Date().toLocaleTimeString();

        const enrichedFlag = {
            ...flag,
            severity: dbSeverity,
            time: timestamp,
            id: Date.now() + Math.random(),
        };

        setFlags(prev => [...prev, enrichedFlag]);

        // Show toast warning (never terminate — PW Test difference #1)
        if (dbSeverity === 'RED' || dbSeverity === 'ORANGE') {
            setWarningMsg(`${dbSeverity} Flag: ${flag.message}`);
            setWarningOpen(true);
        }

        console.log(`[PW Test] ${dbSeverity} FLAG: ${flag.message} (${flag.type})`);
    }, [submitted]);

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
    }, [sharedStream]);

    // ─── Full Stop (only on submit — disables UI monitors too) ───
    const stopAllProctoring = useCallback(() => {
        console.log('[PW Test] Stopping ALL Proctoring Services...');
        stopBackendServices();
        setDisabledModules(['identity', 'device', 'behavior', 'audio', 'network', 'enforcement']);
    }, [stopBackendServices]);

    // ─── Cleanup on unmount (IPC only — don't touch React state) ───
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
            stopBackendServices();
        };
    }, []);

    // ─── Stop proctoring when submitted ───
    useEffect(() => {
        if (submitted) {
            stopAllProctoring();
        }
    }, [submitted]);

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

    // ─── Start proctoring when PreChecks complete ───
    useEffect(() => {
        if (preChecksComplete && !submitted) {
            console.log('[PW Test] Exam phase started — mounting monitors. disabledModules:', disabledModules);

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
                    console.log('[PW Test] Shared media stream acquired (camera + mic)');
                } catch (err) {
                    console.error('[PW Test] Failed to acquire shared stream:', err);
                }
            })();

            // Start Backend Services (if not disabled)
            if (window.electronAPI) {
                if (!disabledModules.includes('enforcement')) {
                    window.electronAPI.startEnforcement();
                    console.log('[PW Test] Enforcement started');
                }
                if (!disabledModules.includes('network')) {
                    window.electronAPI.startNetworkMonitor();
                    console.log('[PW Test] Network monitor started');
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
    }, [preChecksComplete, submitted]);

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

    // Triple-click handler for admin override (mirrors ExamSession)
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

    // ─── Answer handler (local only) ───
    const handleAnswer = (questionId, value) => {
        const newAnswer = [value];
        setAnswers(prev => ({ ...prev, [questionId]: newAnswer }));
    };

    // ─── Submit handler ───
    const handleAutoSubmit = async () => {
        await submitExam();
    };

    const submitExam = async () => {
        await stopAllProctoring();
        if (timerRef.current) clearInterval(timerRef.current);
        setSubmitted(true);
        setConfirmSubmit(false);
    };

    // ─── Format time ───
    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    // ═══════════════════════════════════════════
    // RENDER: Pre-test checks (same as ExamSession)
    // ═══════════════════════════════════════════
    if (!preChecksComplete && !submitted) {
        return <PreTestCheck onComplete={() => setPreChecksComplete(true)} />;
    }

    // ═══════════════════════════════════════════
    // RENDER: Post-submission view
    // ═══════════════════════════════════════════
    if (submitted) {
        const totalScore = questions.reduce((acc, q) => {
            const ans = answers[q.id] || [];
            const isCorrect = ans.length > 0 && JSON.stringify(q.correct_answer?.sort()) === JSON.stringify(ans.sort());
            return acc + (isCorrect ? q.marks : 0);
        }, 0);

        return (
            <Box sx={{ textAlign: 'center', py: 6, maxWidth: 600, mx: 'auto' }}>
                <CheckCircle sx={{ fontSize: 72, color: '#4ECDC4', mb: 2 }} />
                <Typography variant="h4" fontWeight={700} gutterBottom>PW Demo Test Complete</Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                    This was a demo — no data was sent to any server.
                </Typography>
                <Card><CardContent sx={{ p: 3 }}>
                    <Typography variant="h3" fontWeight={700} color="primary">{totalScore}/{DEMO_TEST.total_marks}</Typography>
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
    // RENDER: Active exam view (mirrors ExamSession exactly)
    // ═══════════════════════════════════════════
    const currentQuestion = questions[currentQ];
    const answeredCount = questions.filter(q => answers[q.id]?.length > 0).length;
    const isUrgent = timeLeft < 120;

    return (
        <Box sx={{ display: 'flex', gap: 2, height: '100vh', p: 2 }}>
            {/* Main Question Area */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Timer Bar — identical to ExamSession */}
                <Paper sx={{
                    p: 1.5, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: isUrgent ? 'rgba(255,77,106,0.1)' : 'rgba(108,99,255,0.06)',
                    border: `1px solid ${isUrgent ? 'rgba(255,77,106,0.3)' : 'rgba(108,99,255,0.15)'}`,
                    cursor: 'pointer',
                }} onClick={handleTimerClick}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={600}>PW Demo Test — Computer Science</Typography>
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

                {/* Question Card — identical to ExamSession */}
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
                </CardContent></Card>

                {/* Navigation — identical to ExamSession */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Button startIcon={<NavigateBefore />} onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                        disabled={currentQ === 0} variant="outlined">Previous</Button>
                    <Button variant="contained" color="warning" onClick={() => setConfirmSubmit(true)}
                        startIcon={<Send />}>Submit Exam</Button>
                    <Button endIcon={<NavigateNext />} onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))}
                        disabled={currentQ === questions.length - 1} variant="outlined">Next</Button>
                </Box>
            </Box>

            {/* Question Palette — identical to ExamSession */}
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

                {/* ─── Liveness & Spoof Risk Panel ─── */}
                {sharedStream && (
                    <Box sx={{
                        mt: 3, p: 1.5, borderRadius: 2,
                        border: '1px solid',
                        borderColor: livenessData.spoofProb !== null && livenessData.spoofProb > 0.75
                            ? 'error.main'
                            : livenessData.spoofProb !== null && livenessData.spoofProb > 0.4
                                ? 'warning.main'
                                : 'divider',
                        bgcolor: livenessData.spoofProb !== null && livenessData.spoofProb > 0.75
                            ? 'rgba(255,77,106,0.07)'
                            : 'transparent',
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                            <Security sx={{
                                fontSize: 14,
                                color: livenessData.spoofProb !== null && livenessData.spoofProb > 0.75
                                    ? 'error.main'
                                    : livenessData.spoofProb !== null && livenessData.spoofProb > 0.4
                                        ? 'warning.main' : 'success.main'
                            }} />
                            <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.65rem', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                Liveness Check
                            </Typography>
                        </Box>

                        {/* Spoof Probability */}
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                            Spoof Risk
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                            <Box sx={{ flex: 1, height: 6, bgcolor: 'action.hover', borderRadius: 3, overflow: 'hidden' }}>
                                <Box sx={{
                                    width: livenessData.spoofProb !== null ? `${livenessData.spoofProb * 100}%` : '0%',
                                    height: '100%',
                                    borderRadius: 3,
                                    bgcolor: livenessData.spoofProb > 0.75 ? '#FF4D6A'
                                        : livenessData.spoofProb > 0.4 ? '#faad14' : '#52c41a',
                                    transition: 'all 0.5s ease',
                                }} />
                            </Box>
                            <Typography variant="caption" fontWeight={700} sx={{
                                fontSize: '0.65rem', minWidth: 28, textAlign: 'right',
                                color: livenessData.spoofProb > 0.75 ? 'error.main'
                                    : livenessData.spoofProb > 0.4 ? 'warning.main' : 'success.main'
                            }}>
                                {livenessData.spoofProb !== null ? `${(livenessData.spoofProb * 100).toFixed(0)}%` : '—'}
                            </Typography>
                        </Box>

                        {/* Face Match Score */}
                        {livenessData.similarity !== null && (
                            <>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                                    Face Match
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{ flex: 1, height: 6, bgcolor: 'action.hover', borderRadius: 3, overflow: 'hidden' }}>
                                        <Box sx={{
                                            width: `${Math.max(0, livenessData.similarity) * 100}%`,
                                            height: '100%',
                                            borderRadius: 3,
                                            bgcolor: livenessData.similarity >= 0.60 ? '#52c41a' : '#FF4D6A',
                                            transition: 'all 0.5s ease',
                                        }} />
                                    </Box>
                                    <Typography variant="caption" fontWeight={700} sx={{
                                        fontSize: '0.65rem', minWidth: 28, textAlign: 'right',
                                        color: livenessData.similarity >= 0.60 ? 'success.main' : 'error.main',
                                    }}>
                                        {`${(livenessData.similarity * 100).toFixed(0)}%`}
                                    </Typography>
                                </Box>
                            </>
                        )}

                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontSize: '0.58rem' }}>
                            {livenessData.spoofProb === null ? 'Waiting for first scan...' :
                                livenessData.spoofProb > 0.75 ? '⚠ Possible spoof detected' :
                                    livenessData.spoofProb > 0.4 ? 'Low confidence — remain visible' :
                                        '✓ Live person confirmed'}
                        </Typography>
                    </Box>
                )}
            </Paper>


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
                    <Alert severity="info" sx={{ mt: 1 }}>This is a demo — no data is saved to any server.</Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmSubmit(false)}>Continue Exam</Button>
                    <Button variant="contained" color="warning" onClick={submitExam}>Confirm Submit</Button>
                </DialogActions>
            </Dialog>

            {/* Admin Override Panel — same as ExamSession */}
            <AdminOverridePanel
                open={overrideOpen}
                onClose={(modules) => {
                    setOverrideOpen(false);
                    if (modules && modules.length > 0) {
                        setDisabledModules(modules);
                    }
                }}
                sessionId="pw-demo-session"
            />

            {/* ═══════════════════════════════════════════ */}
            {/* PROCTORING MONITORS — floating & draggable  */}
            {/* (IdentityMonitor removed for PW Test)       */}
            {/* ═══════════════════════════════════════════ */}
            {!submitted && !disabledModules.includes('identity') && sharedStream && (
                <IdentityMonitor
                    active={!submitted}
                    hidden={true}
                    stream={sharedStream}
                    onStatusChange={logFlag}
                    onLivenessUpdate={handleLivenessUpdate}
                />
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

            {/* In-App Calculator */}
            <ExamCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />

            {/* Warning Toast — same as ExamSession */}
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
        </Box>
    );
}

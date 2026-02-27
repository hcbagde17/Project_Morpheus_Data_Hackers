import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Button, LinearProgress, Chip,
    List, ListItem, ListItemText, Divider, Grid, Alert,
    Table, TableHead, TableRow, TableCell, TableBody,
    Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, TextField,
    IconButton, Tooltip, Paper, Tabs, Tab, CircularProgress
} from '@mui/material';
import {
    ArrowBack, CheckCircle, Cancel, Help, Flag, Warning,
    Videocam, PlayArrow, Info, AutoAwesome
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export default function StudentTestResult() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';

    const [session, setSession] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);

    // Review Dialog State
    const [reviewOpen, setReviewOpen] = useState(false);
    const [selectedFlag, setSelectedFlag] = useState(null);
    const [reviewAction, setReviewAction] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');
    const [advisorOpen, setAdvisorOpen] = useState(false);
    const [advisorLoading, setAdvisorLoading] = useState(false);
    const [advisorResponse, setAdvisorResponse] = useState('');

    useEffect(() => { loadResult(); }, [sessionId]);

    const loadResult = async () => {
        try {
            // Get session details
            const { data: sessionData } = await supabase
                .from('exam_sessions')
                .select('*, tests(*)')
                .eq('id', sessionId)
                .single();

            setSession(sessionData);

            if (sessionData) {
                // Get questions via junction table
                const { data: qData } = await supabase
                    .from('test_questions')
                    .select('questions(*)')
                    .eq('test_id', sessionData.test_id)
                    .order('question_order');

                const flatQuestions = qData?.map(q => q.questions) || [];
                setQuestions(flatQuestions);

                // Get answers
                const { data: aData } = await supabase
                    .from('answers')
                    .select('*')
                    .eq('session_id', sessionId);

                const ansMap = {};
                aData?.forEach(a => ansMap[a.question_id] = a);
                setAnswers(ansMap);

                // Get flags
                const { data: flagData } = await supabase
                    .from('flags')
                    .select('*')
                    .eq('session_id', sessionId)
                    .order('timestamp', { ascending: false });

                setFlags(flagData || []);
            }
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const handleReview = async () => {
        if (!selectedFlag) return;

        // Update flag status
        await supabase.from('flags').update({
            reviewed: true,
            review_action: reviewAction,
            review_notes: reviewNotes,
        }).eq('id', selectedFlag.id);

        // Handle Exam Invalidation
        if (reviewAction === 'invalidate' && isAdmin) {
            await supabase.from('exam_sessions').update({
                status: 'invalidated',
                score: 0,
                ended_at: new Date().toISOString()
            }).eq('id', selectedFlag.session_id);

            // Create audit log
            await supabase.from('audit_logs').insert({
                action: 'EXAM_INVALIDATED',
                user_id: user.id,
                details: {
                    session_id: selectedFlag.session_id,
                    reason: reviewNotes,
                    flag_id: selectedFlag.id
                }
            });
        }

        setReviewOpen(false);
        setSelectedFlag(null);
        setReviewAction('');
        setReviewNotes('');
        loadResult(); // Reload to get updated flags
    };

    if (loading) return <LinearProgress />;
    if (!session) return <Typography>Result not found</Typography>;

    // Calculate details
    const totalQuestions = questions.length;
    const correctCount = questions.filter(q => {
        const userAnsArray = answers[q.id]?.selected_answer || [];
        const correctArray = q.correct_answer || [];
        return userAnsArray.length > 0 && JSON.stringify(userAnsArray.sort()) === JSON.stringify(correctArray.sort());
    }).length;

    const handleAIAdvisor = async () => {
        setAdvisorOpen(true);
        if (advisorResponse) return; // Already generated
        setAdvisorLoading(true);

        try {
            // Build the context string
            let promptText = `Analyze the following student test performance and provide a short, encouraging list of specific topics the student should focus on studying to improve. Format using Markdown (bullet points, bold text). Do not output JSON. Keep it concise, friendly, and actionable.\n\nTest Subject: ${session.tests?.title || 'General Test'}\nMarks Obtained: ${session.score} / ${session.tests?.total_marks}\n\nQuestions Analysis:\n`;

            questions.forEach((q, i) => {
                const userAnsArray = answers[q.id]?.selected_answer || [];
                const correctArray = q.correct_answer || [];
                const isCorrect = userAnsArray.length > 0 && JSON.stringify(userAnsArray.sort()) === JSON.stringify(correctArray.sort());
                const userAns = Array.isArray(userAnsArray) ? userAnsArray.join(', ') : userAnsArray;
                const correctAns = Array.isArray(q.correct_answer) ? q.correct_answer.join(', ') : q.correct_answer;

                promptText += `Q${i + 1}: ${q.question_text}\nStudent Answer: ${userAns || 'Skipped'}\nCorrect Answer: ${correctAns}\nStatus: ${isCorrect ? 'Correct' : 'Incorrect'}\n\n`;
            });

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }]
                })
            });

            if (!res.ok) throw new Error("API call failed");
            const data = await res.json();
            setAdvisorResponse(data.candidates[0].content.parts[0].text);
        } catch (err) {
            console.error(err);
            setAdvisorResponse("Sorry, the AI Advisor is currently unavailable. Please try again later.");
        }
        setAdvisorLoading(false);
    };

    return (
        <Box>
            <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back</Button>

            {/* Header with Score/Status */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, md: 8 }}>
                    <Typography variant="h4" fontWeight={700}>{session.tests?.title}</Typography>
                    <Typography color="text.secondary">
                        Submitted on {new Date(session.ended_at).toLocaleString()}
                    </Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }} sx={{ textAlign: 'right', display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center' }}>

                    {/* Flags Summary (Admins & Teachers Only) */}
                    {(isAdmin || isTeacher) && (
                        <>
                            {(flags.filter(f => f.severity === 'RED' || f.severity === 'high').length > 0 || flags.filter(f => f.severity === 'ORANGE' || f.severity === 'medium' || f.severity === 'YELLOW').length > 0) ? (
                                <>
                                    {flags.filter(f => f.severity === 'RED' || f.severity === 'high').length > 0 && (
                                        <Chip label={`${flags.filter(f => f.severity === 'RED' || f.severity === 'high').length} R`} color="error" size="small" sx={{ fontWeight: 'bold' }} />
                                    )}
                                    {flags.filter(f => f.severity === 'ORANGE' || f.severity === 'medium' || f.severity === 'YELLOW').length > 0 && (
                                        <Chip label={`${flags.filter(f => f.severity === 'ORANGE' || f.severity === 'medium' || f.severity === 'YELLOW').length} O`} color="warning" size="small" sx={{ fontWeight: 'bold' }} />
                                    )}
                                </>
                            ) : (
                                <Chip label="Clean" color="success" size="small" sx={{ fontWeight: 'bold' }} />
                            )}
                        </>
                    )}

                    {/* Score/Status */}
                    {session.status === 'invalidated' ? (
                        <Chip label="RESULT INVALIDATED" color="error" sx={{ fontSize: '1.2rem', py: 2, px: 1, fontWeight: 'bold' }} />
                    ) : (
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <Button variant="contained" sx={{ bgcolor: '#6C63FF', color: 'white' }} startIcon={<AutoAwesome />} onClick={handleAIAdvisor}>
                                AI Advisor
                            </Button>
                            <Chip label={`Score: ${session.score} / ${session.tests?.total_marks}`}
                                color={session.score >= (session.tests?.total_marks * 0.4) ? "success" : "error"}
                                sx={{ fontSize: '1.2rem', py: 2, px: 1 }} />
                        </Box>
                    )}
                </Grid>
            </Grid>

            {/* Content: Invalidated Warning OR Answer Review */}
            {session.status === 'invalidated' ? (
                <Alert severity="error" variant="filled" sx={{ mt: 4, p: 3, borderRadius: 2 }}>
                    <Typography variant="h6" fontWeight={700} gutterBottom>
                        Exam Result Voided
                    </Typography>
                    <Typography variant="body1">
                        This exam session has been invalidated by the administration due to proctoring violations.
                        Your score has been recorded as 0 (Zero). Please contact your instructor for more details.
                    </Typography>
                </Alert>
            ) : (
                <>
                    {/* Tabs for Teachers and Admins */}
                    {(isAdmin || isTeacher) && (
                        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3, mt: 4 }}>
                            <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
                                <Tab label="Review Answers" />
                                <Tab label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Flag fontSize="small" color={flags.length > 0 ? "error" : "inherit"} />
                                        Session Flags ({flags.length})
                                    </Box>
                                } />
                            </Tabs>
                        </Box>
                    )}

                    {/* Flags View */}
                    {(isAdmin || isTeacher) && tabValue === 1 && (
                        <Box sx={{ mb: 4 }}>
                            <Card>
                                <CardContent sx={{ p: 0 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: 'rgba(108,99,255,0.05)' }}>
                                                <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Severity</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Evidence</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {flags.map(f => (
                                                <TableRow
                                                    key={f.id}
                                                    hover
                                                    sx={{
                                                        borderLeft: (f.severity === 'high' || f.severity === 'RED') ? '3px solid #FF4D6A' :
                                                            (f.severity === 'medium' || f.severity === 'ORANGE' || f.severity === 'YELLOW') ? '3px solid #FF9800' : '3px solid #ccc'
                                                    }}
                                                >
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                                            {f.type || f.flag_type}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={f.severity}
                                                            size="small"
                                                            color={(f.severity === 'high' || f.severity === 'RED') ? 'error' : (f.severity === 'medium' || f.severity === 'ORANGE' || f.severity === 'YELLOW') ? 'warning' : 'default'}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption" sx={{ maxWidth: 200, display: 'block' }}>
                                                            {f.details?.message || '—'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption">
                                                            {f.timestamp ? new Date(f.timestamp).toLocaleString() : '—'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        {f.evidence_url ? (
                                                            <Tooltip title="View Evidence">
                                                                <IconButton
                                                                    size="small"
                                                                    color="primary"
                                                                    onClick={() => { setSelectedFlag(f); setReviewOpen(true); }}
                                                                >
                                                                    <PlayArrow />
                                                                </IconButton>
                                                            </Tooltip>
                                                        ) : (
                                                            <Typography variant="caption" color="text.disabled">—</Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {f.reviewed ? (
                                                            <Chip label="Reviewed" size="small" color="success" icon={<CheckCircle />} />
                                                        ) : (
                                                            <Chip label="Pending" size="small" color="warning" variant="outlined" />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            size="small"
                                                            variant={f.reviewed ? 'text' : 'contained'}
                                                            onClick={() => { setSelectedFlag(f); setReviewOpen(true); }}
                                                        >
                                                            {f.reviewed ? 'View' : 'Review'}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {flags.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                                                        <CheckCircle sx={{ fontSize: 48, color: '#4ECDC4', mb: 1, opacity: 0.8 }} />
                                                        <Typography variant="body2" color="text.secondary">
                                                            No flags recorded for this session.
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </Box>
                    )}

                    {/* Answers View */}
                    {((!isAdmin && !isTeacher) || tabValue === 0) && (
                        <>
                            {(!isAdmin && !isTeacher) && (
                                <Typography variant="h6" fontWeight={600} gutterBottom sx={{ mt: 4 }}>
                                    Review Answers
                                </Typography>
                            )}

                            <List>
                                {questions.map((q, idx) => {
                                    const userAnsArray = answers[q.id]?.selected_answer || [];
                                    const correctArray = q.correct_answer || [];
                                    const isSkipped = userAnsArray.length === 0;
                                    const isCorrect = !isSkipped && JSON.stringify(userAnsArray.sort()) === JSON.stringify(correctArray.sort());

                                    return (
                                        <Card key={q.id} sx={{ mb: 2, borderLeft: isCorrect ? '4px solid #4ECDC4' : isSkipped ? '4px solid #FFB74D' : '4px solid #FF4D6A' }}>
                                            <CardContent>
                                                <Box sx={{ display: 'flex', gap: 2 }}>
                                                    <Box sx={{ mt: 0.5 }}>
                                                        {isCorrect ? <CheckCircle color="success" /> : isSkipped ? <Help color="warning" /> : <Cancel color="error" />}
                                                    </Box>
                                                    <Box sx={{ flex: 1 }}>
                                                        <Typography variant="subtitle1" fontWeight={600}>
                                                            Q{idx + 1}. {q.question_text}
                                                        </Typography>
                                                        <Box sx={{ mt: 1, p: 1.5, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.02)' }}>
                                                            <Typography variant="body2" color={isCorrect ? "success.light" : "error.light"}>
                                                                Your Answer: {isSkipped ? '(Skipped)' : userAnsArray.join(', ')}
                                                            </Typography>
                                                            {!isCorrect && (
                                                                <Typography variant="body2" color="success.light" sx={{ mt: 0.5 }}>
                                                                    Correct Answer: {correctArray.join(', ')}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                                            Marks: {isCorrect ? q.marks : 0} / {q.marks}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </List>
                        </>
                    )}
                </>
            )}

            {/* Review Dialog */}
            <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning color={(selectedFlag?.severity === 'high' || selectedFlag?.severity === 'RED') ? 'error' : 'warning'} />
                    Review Flag: {selectedFlag?.type || selectedFlag?.flag_type}
                </DialogTitle>
                <DialogContent>
                    {/* Flag Details */}
                    <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(108,99,255,0.03)', borderRadius: 2 }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}>
                                <Typography variant="body2"><strong>Type:</strong> {selectedFlag?.type || selectedFlag?.flag_type}</Typography>
                                <Typography variant="body2"><strong>Severity:</strong> {selectedFlag?.severity}</Typography>
                                <Typography variant="body2"><strong>Time:</strong> {selectedFlag?.timestamp ? new Date(selectedFlag.timestamp).toLocaleString() : '—'}</Typography>
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                                <Typography variant="body2"><strong>Test:</strong> {session?.tests?.title || '—'}</Typography>
                                <Typography variant="body2"><strong>Message:</strong> {selectedFlag?.details?.message || '—'}</Typography>
                            </Grid>
                        </Grid>
                    </Paper>

                    {/* Evidence Video */}
                    {selectedFlag?.evidence_url ? (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Videocam fontSize="small" /> Evidence Video
                            </Typography>
                            <Box sx={{ bgcolor: '#000', borderRadius: 2, overflow: 'hidden', maxHeight: 400 }}>
                                <video
                                    src={selectedFlag.evidence_url}
                                    controls
                                    style={{ width: '100%', maxHeight: 400 }}
                                />
                            </Box>
                        </Box>
                    ) : (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            No video evidence available for this flag.
                        </Alert>
                    )}

                    {/* Show form if unreviewed OR if it's an escalated flag viewed by Admin */}
                    {(!selectedFlag?.reviewed || (isAdmin && selectedFlag?.review_action === 'escalate')) && (
                        <>
                            <TextField
                                fullWidth
                                select
                                label="Action"
                                value={reviewAction}
                                onChange={e => setReviewAction(e.target.value)}
                                sx={{ mb: 2 }}
                            >
                                <MenuItem value="dismiss">Dismiss — No Action</MenuItem>
                                <MenuItem value="warn">Warn Student</MenuItem>
                                {isAdmin && <MenuItem value="invalidate">Invalidate Exam (Zero Score)</MenuItem>}
                                {!isAdmin && <MenuItem value="escalate">Escalate to Admin</MenuItem>}
                            </TextField>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Review Notes"
                                value={reviewNotes}
                                onChange={e => setReviewNotes(e.target.value)}
                                placeholder="Add notes about this flag..."
                            />
                        </>
                    )}

                    {selectedFlag?.reviewed && selectedFlag?.review_action !== 'escalate' && (
                        <Alert severity="success" sx={{ mt: 2 }}>
                            <strong>Reviewed</strong> — Action: {selectedFlag.review_action || 'N/A'}
                            {selectedFlag.review_notes && <Typography variant="body2" sx={{ mt: 1 }}>{selectedFlag.review_notes}</Typography>}
                        </Alert>
                    )}

                    {/* Show info for Escalated flags if Admin is viewing (before they act) */}
                    {selectedFlag?.review_action === 'escalate' && (
                        <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
                            <strong>Escalated by Teacher</strong>
                            {selectedFlag.review_notes && <Typography variant="body2" sx={{ mt: 1 }}>Teacher Notes: {selectedFlag.review_notes}</Typography>}
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReviewOpen(false)}>Close</Button>
                    {(!selectedFlag?.reviewed || (isAdmin && selectedFlag?.review_action === 'escalate')) && (
                        <Button variant="contained" onClick={handleReview} disabled={!reviewAction}>
                            Submit Review
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* AI Advisor Dialog */}
            <Dialog open={advisorOpen} onClose={() => setAdvisorOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AutoAwesome sx={{ color: '#6C63FF' }} /> AI Study Advisor
                </DialogTitle>
                <DialogContent dividers sx={{ minHeight: '300px' }}>
                    {advisorLoading ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', mt: 4 }}>
                            <CircularProgress sx={{ mb: 2, color: '#6C63FF' }} />
                            <Typography>Analyzing your test performance...</Typography>
                        </Box>
                    ) : (
                        <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{advisorResponse}</Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAdvisorOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

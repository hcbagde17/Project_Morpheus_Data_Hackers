import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Button, LinearProgress, Chip,
    List, ListItem, ListItemText, Divider, Grid, Alert
} from '@mui/material';
import { ArrowBack, CheckCircle, Cancel, Help } from '@mui/icons-material';
import { supabase } from '../lib/supabase';

export default function StudentTestResult() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [loading, setLoading] = useState(true);

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
            }
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    if (loading) return <LinearProgress />;
    if (!session) return <Typography>Result not found</Typography>;

    // Calculate details
    const totalQuestions = questions.length;
    const correctCount = questions.filter(q => {
        const ans = answers[q.id]?.selected_option;
        // Simple check for now. For multi-select, logic differs.
        if (q.type === 'multiple') {
            // Assuming correct_option is JSON array for multiple? Or simple string match?
            // Existing schema suggests correct_option is text.
            return ans === q.correct_option;
        }
        return ans === q.correct_option;
    }).length;

    return (
        <Box>
            <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back</Button>

            {/* Header with Score/Status */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={8}>
                    <Typography variant="h4" fontWeight={700}>{session.tests?.title}</Typography>
                    <Typography color="text.secondary">
                        Submitted on {new Date(session.ended_at).toLocaleString()}
                    </Typography>
                </Grid>
                <Grid item xs={12} md={4} sx={{ textAlign: 'right' }}>
                    {session.status === 'invalidated' ? (
                        <Chip label="RESULT INVALIDATED" color="error" sx={{ fontSize: '1.2rem', py: 2, px: 1, fontWeight: 'bold' }} />
                    ) : (
                        <Chip label={`Score: ${session.score} / ${session.tests?.total_marks}`}
                            color={session.score >= (session.tests?.total_marks * 0.4) ? "success" : "error"}
                            sx={{ fontSize: '1.2rem', py: 2, px: 1 }} />
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
                    <Typography variant="h6" fontWeight={600} gutterBottom sx={{ mt: 4 }}>
                        Review Answers
                    </Typography>

                    <List>
                        {questions.map((q, idx) => {
                            const userAns = answers[q.id]?.selected_option;
                            const isCorrect = userAns === q.correct_option;
                            const isSkipped = !userAns;

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
                                                        Your Answer: {userAns || '(Skipped)'}
                                                    </Typography>
                                                    {!isCorrect && (
                                                        <Typography variant="body2" color="success.light" sx={{ mt: 0.5 }}>
                                                            Correct Answer: {q.correct_option}
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
        </Box>
    );
}

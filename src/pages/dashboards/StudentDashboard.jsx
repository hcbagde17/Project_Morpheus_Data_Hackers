import { useState, useEffect } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Chip, Button,
    LinearProgress, List, ListItem, ListItemText, ListItemIcon, Avatar,
} from '@mui/material';
import {
    Assignment, CalendarMonth, TrendingUp, PlayArrow,
    CheckCircle, Schedule, Flag, Warning,
} from '@mui/icons-material';
import { supabase } from '../../lib/supabase';
import useAuthStore from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

export default function StudentDashboard() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [upcomingExams, setUpcomingExams] = useState([]);
    const [pastResults, setPastResults] = useState([]);
    const [flagCount, setFlagCount] = useState(0);
    const [faceRegistered, setFaceRegistered] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Get enrolled courses and their upcoming tests
            const { data: enrollments } = await supabase
                .from('enrollments')
                .select('course_id, courses(id, name, code)')
                .eq('student_id', user.id);

            const courseIds = enrollments?.map(e => e.course_id) || [];

            if (courseIds.length > 0) {
                // Upcoming exams
                const { data: exams } = await supabase
                    .from('tests')
                    .select('*, courses(name)')
                    .in('course_id', courseIds)
                    .gte('end_time', new Date().toISOString())
                    .order('start_time', { ascending: true })
                    .limit(5);

                setUpcomingExams(exams || []);
            }

            // Past results
            const { data: sessions } = await supabase
                .from('exam_sessions')
                .select('*, tests(title, total_marks)')
                .eq('student_id', user.id)
                .in('status', ['completed', 'submitted'])
                .order('ended_at', { ascending: false })
                .limit(5);

            setPastResults(sessions || []);

            // Flag count
            const { data: studentSessions } = await supabase
                .from('exam_sessions')
                .select('id')
                .eq('student_id', user.id);

            if (studentSessions?.length > 0) {
                const sessionIds = studentSessions.map(s => s.id);
                const { count } = await supabase
                    .from('flags')
                    .select('id', { count: 'exact', head: true })
                    .in('session_id', sessionIds);
                setFlagCount(count || 0);
            }

            // Check face registration
            const { data: face } = await supabase
                .from('face_registrations')
                .select('id')
                .eq('user_id', user.id)
                .single();
            setFaceRegistered(!!face);
        } catch (err) {
            console.error('Failed to load student data:', err);
        }
        setLoading(false);
    };

    const isExamReady = (test) => {
        const now = new Date();
        const start = new Date(test.start_time);
        const diff = (start - now) / 60000; // minutes
        return diff <= 5 && diff >= -test.duration_minutes;
    };

    if (loading) return <LinearProgress sx={{ borderRadius: 1 }} />;

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    Welcome back, {user.full_name || user.username?.split('@')[0]} 👋
                    <Chip
                        icon={faceRegistered ? <CheckCircle /> : <Warning />}
                        label={faceRegistered ? "Face ID Active" : "Face ID Pending"}
                        color={faceRegistered ? "success" : "warning"}
                        variant="outlined"
                        onClick={() => !faceRegistered && navigate('/dashboard/face-registration')}
                        sx={{ cursor: !faceRegistered ? 'pointer' : 'default' }}
                    />
                </Typography>
                <Typography color="text.secondary">
                    View your upcoming exams, past results, and profile
                </Typography>
            </Box>

            <Grid container spacing={3}>
                {/* Upcoming Exams */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Card>
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <CalendarMonth color="primary" />
                                <Typography variant="h6" fontWeight={600}>Upcoming Exams</Typography>
                            </Box>
                            {upcomingExams.length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <Schedule sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                                    <Typography color="text.secondary">No upcoming exams</Typography>
                                </Box>
                            ) : (
                                upcomingExams.map((exam) => {
                                    const ready = isExamReady(exam);
                                    const start = new Date(exam.start_time);
                                    return (
                                        <Box key={exam.id} sx={{
                                            p: 2, mb: 1.5, borderRadius: 2,
                                            border: '1px solid',
                                            borderColor: ready ? 'rgba(78, 205, 196, 0.3)' : 'rgba(148,163,184,0.08)',
                                            bgcolor: ready ? 'rgba(78, 205, 196, 0.05)' : 'rgba(255,255,255,0.02)',
                                        }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Box>
                                                    <Typography variant="body1" fontWeight={600}>{exam.title}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {exam.courses?.name} • {exam.duration_minutes} min • {start.toLocaleString()}
                                                    </Typography>
                                                </Box>
                                                {ready ? (
                                                    <Button variant="contained" size="small" startIcon={<PlayArrow />}
                                                        onClick={() => navigate(`/dashboard/exam/${exam.id}`)}
                                                        sx={{ background: 'linear-gradient(135deg, #4ECDC4, #44B09E)' }}>
                                                        Start Exam
                                                    </Button>
                                                ) : (
                                                    <Chip label={`Starts ${start.toLocaleDateString()}`} size="small" variant="outlined" />
                                                )}
                                            </Box>
                                        </Box>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Stats + Flags */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Grid container spacing={3}>
                        <Grid size={12}>
                            <Card>
                                <CardContent sx={{ p: 3 }}>
                                    <Typography variant="h6" fontWeight={600} gutterBottom>Your Stats</Typography>
                                    <Box sx={{ display: 'flex', gap: 3 }}>
                                        <Box sx={{ textAlign: 'center' }}>
                                            <Typography variant="h3" fontWeight={700} color="primary">
                                                {pastResults.length}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">Exams Taken</Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'center' }}>
                                            <Typography variant="h3" fontWeight={700} sx={{ color: '#4ECDC4' }}>
                                                {pastResults.length > 0
                                                    ? Math.round(pastResults.reduce((a, s) => a + (s.score || 0), 0) / pastResults.length)
                                                    : 0}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">Avg Score</Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'center' }}>
                                            <Typography variant="h3" fontWeight={700}
                                                sx={{ color: flagCount > 0 ? '#FF4D6A' : '#4ECDC4' }}>
                                                {flagCount}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">Total Flags</Typography>
                                        </Box>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid size={12}>
                            <Card>
                                <CardContent sx={{ p: 3 }}>
                                    <Typography variant="h6" fontWeight={600} gutterBottom>Recent Results</Typography>
                                    {pastResults.length === 0 ? (
                                        <Typography color="text.secondary" variant="body2">No results yet</Typography>
                                    ) : (
                                        pastResults.map((result) => (
                                            <Box key={result.id}
                                                onClick={() => navigate(`/dashboard/results/${result.id}`)}
                                                sx={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    p: 1.5, mb: 1, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)',
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                                                }}>
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>
                                                        {result.tests?.title || 'Unknown Test'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {result.ended_at ? new Date(result.ended_at).toLocaleDateString() : '—'}
                                                    </Typography>
                                                </Box>
                                                <Chip
                                                    label={`${result.score || 0}/${result.tests?.total_marks || 0}`}
                                                    size="small" color="primary" variant="outlined"
                                                />
                                            </Box>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>
        </Box>
    );
}

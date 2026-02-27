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
import AdminAuthDialog from '../../components/AdminAuthDialog';

import { useNavigate } from 'react-router-dom';

// ... (imports)

export default function StudentDashboard() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [upcomingExams, setUpcomingExams] = useState([]);
    const [pastResults, setPastResults] = useState([]);
    const [flagCount, setFlagCount] = useState(0);
    const [faceRegistered, setFaceRegistered] = useState(false);
    const [loading, setLoading] = useState(true);
    const [adminAuthOpen, setAdminAuthOpen] = useState(false);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    const loadData = async () => {
        try {
            // 1. Check Face Registration
            const { data: faceReg } = await supabase
                .from('face_registrations')
                .select('id')
                .eq('user_id', user.id)
                .single();
            setFaceRegistered(!!faceReg);

            // 2. Get Enrollments & Upcoming Tests
            const { data: enrollments } = await supabase
                .from('enrollments')
                .select('course_id')
                .eq('student_id', user.id);

            const courseIds = enrollments?.map(e => e.course_id) || [];

            if (courseIds.length > 0) {
                const { data: tests } = await supabase
                    .from('tests')
                    .select(`
                        id, title, start_time, duration_minutes,
                        courses (name, code)
                    `)
                    .in('course_id', courseIds)
                    .gt('start_time', new Date().toISOString())
                    .order('start_time', { ascending: true });
                setUpcomingExams(tests || []);
            }

            // 3. Get Past Results
            const { data: results } = await supabase
                .from('exam_sessions')
                .select(`
                    id, score, status, ended_at,
                    tests (title, total_marks)
                `)
                .eq('student_id', user.id)
                .in('status', ['completed', 'invalidated'])
                .order('ended_at', { ascending: false });
            setPastResults(results || []);

            // 4. Get Flags Count
            const { count } = await supabase
                .from('flags')
                .select('*', { count: 'exact', head: true })
                .eq('student_id', user.id);
            setFlagCount(count || 0);

        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFaceIdUpdate = () => {
        setAdminAuthOpen(true);
    };

    const handleAdminSuccess = async () => {
        try {
            // Delete existing registration
            const { error } = await supabase
                .from('face_registrations')
                .delete()
                .eq('user_id', user.id);

            if (error) throw error;

            // Redirect to re-register
            navigate('/dashboard/face-registration');
        } catch (err) {
            console.error('Failed to reset face ID:', err);
            // Optionally show error snackbar
        }
    };

    const isExamReady = (test) => {
        // ... (existing logic)
        const now = new Date();
        const start = new Date(test.start_time);
        const diff = (start - now) / 60000; // minutes
        return diff <= 5 && diff >= -test.duration_minutes;
    };

    if (loading) return <LinearProgress sx={{ borderRadius: 1 }} />;

    return (
        <Box>
            <AdminAuthDialog
                open={adminAuthOpen}
                onClose={() => setAdminAuthOpen(false)}
                onSuccess={handleAdminSuccess}
                title="Reset Face ID Verification"
            />
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    Welcome back, {user.full_name || user.username?.split('@')[0]} 👋
                    <Chip
                        icon={faceRegistered ? <CheckCircle /> : <Warning />}
                        label={faceRegistered ? "Face ID Active (Click to Reset)" : "Face ID Pending"} // Updated Label
                        color={faceRegistered ? "success" : "warning"}
                        variant="outlined"
                        // If registered, open Admin Dialog. If not, go to registration directly.
                        onClick={() => faceRegistered ? handleFaceIdUpdate() : navigate('/dashboard/face-registration')}
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}
                    />
                </Typography>
                <Typography color="text.secondary">
                    View your upcoming exams, past results, and profile
                </Typography>
            </Box>

            {/* ... Rest of UI ... */}

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
                                                    p: 1.5, mb: 1, borderRadius: 2,
                                                    bgcolor: result.status === 'invalidated' ? 'rgba(255, 77, 106, 0.05)' : 'rgba(255,255,255,0.02)',
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                                                }}>
                                                <Box>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Typography variant="body2" fontWeight={600}>
                                                            {result.tests?.title || 'Unknown Test'}
                                                        </Typography>
                                                        {result.status === 'invalidated' && (
                                                            <Chip label="INVALIDATED" size="small" color="error" sx={{ height: 16, fontSize: 9 }} />
                                                        )}
                                                    </Box>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {result.ended_at ? new Date(result.ended_at).toLocaleDateString() : '—'}
                                                    </Typography>
                                                </Box>
                                                {result.status === 'invalidated' ? (
                                                    <Typography variant="body2" fontWeight={700} color="error">VOID</Typography>
                                                ) : (
                                                    <Chip
                                                        label={`${result.score || 0}/${result.tests?.total_marks || 0}`}
                                                        size="small" color="primary" variant="outlined"
                                                    />
                                                )}
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

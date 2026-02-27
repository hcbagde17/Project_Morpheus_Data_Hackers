import { useState, useEffect, useRef } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Chip, Button,
    LinearProgress, List, ListItem, ListItemText, ListItemIcon, Avatar,
} from '@mui/material';
import {
    Assignment, CalendarMonth, TrendingUp, PlayArrow,
    CheckCircle, Schedule, Flag, Warning, Videocam
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
    // testId → { status, sessionId, score, totalMarks }
    // Updated instantly via Realtime so Start Exam vanishes on all devices simultaneously
    const [mySessionMap, setMySessionMap] = useState({});
    const [flagCount, setFlagCount] = useState(0);
    const [faceRegistered, setFaceRegistered] = useState(false);
    const [loading, setLoading] = useState(true);
    const [adminAuthOpen, setAdminAuthOpen] = useState(false);
    const channelRef = useRef(null);

    useEffect(() => {
        if (user) {
            loadData();
            fetchSessionMap();       // initial session state for all tests
            subscribeToSessions();   // real-time lock — fires in Ms on any device
        }
        return () => {
            // Clean up Realtime channel on unmount
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [user]);

    const loadData = async () => {
        try {
            // 1. Check Face Registration
            const { data: faceReg, error: faceErr } = await supabase
                .from('face_registrations')
                .select('id, centroid_embedding')
                .eq('user_id', user.id)
                .maybeSingle();
            setFaceRegistered(!!(faceReg?.centroid_embedding));

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
                        id, title, start_time, end_time, duration_minutes,
                        courses (name, code)
                    `)
                    .in('course_id', courseIds)
                    .gt('end_time', new Date().toISOString()) // Fetch anything that hasn't ended yet
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

            // 4. Get Flags Count — flags has no student_id column, must join via exam_sessions
            const { data: studentSessions } = await supabase
                .from('exam_sessions')
                .select('id')
                .eq('student_id', user.id);
            const sessionIds = (studentSessions || []).map(s => s.id);
            let flagCount = 0;
            if (sessionIds.length > 0) {
                const { count: fc } = await supabase
                    .from('flags')
                    .select('id', { count: 'exact', head: true })
                    .in('session_id', sessionIds);
                flagCount = fc || 0;
            }
            setFlagCount(flagCount);

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

    // ── Initial load: build testId → session map ────────────────────────────────
    const fetchSessionMap = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('exam_sessions')
            .select('id, test_id, status, score, tests(total_marks)')
            .eq('student_id', user.id);
        const map = {};
        for (const s of (data || [])) {
            if (!map[s.test_id]) {
                map[s.test_id] = { status: s.status, sessionId: s.id, score: s.score, totalMarks: s.tests?.total_marks };
            }
        }
        setMySessionMap(map);
    };

    // ── Real-time lock: fires <500 ms after session row is created on ANY device ─
    const subscribeToSessions = () => {
        if (!user || channelRef.current) return;
        channelRef.current = supabase
            .channel(`session-lock-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'exam_sessions',
                filter: `student_id=eq.${user.id}`,
            }, (payload) => {
                const s = payload.new;
                if (!s?.test_id) return;
                console.log('[SessionLock] ⚡ Realtime:', s.test_id, '→', s.status);
                setMySessionMap(prev => ({
                    ...prev,
                    [s.test_id]: {
                        status: s.status,
                        sessionId: s.id,
                        score: s.score ?? prev[s.test_id]?.score,
                        totalMarks: prev[s.test_id]?.totalMarks,
                    },
                }));
            })
            .subscribe();
    };

    /**
     * Determines the current state of an exam for this student.
     * 'upcoming'   – too early to start (>5 min before start)
     * 'ready'      – within the launch window, no session yet
     * 'active'     – session exists and is in-progress
     * 'completed'  – session submitted successfully
     * 'invalidated'– session was voided by admin
     * 'ended'      – time window has closed, no session was started
     */
    const getExamState = (test) => {
        const now = new Date();
        const start = new Date(test.start_time);
        const end = new Date(test.end_time);

        // Session exists → its status takes full priority (hides Start Exam immediately)
        const session = mySessionMap[test.id];
        if (session) return session.status; // 'active' | 'completed' | 'invalidated'

        if (now > end) return 'ended';
        const minsToStart = (start - now) / 60000;
        if (minsToStart > 5) return 'upcoming';
        return 'ready';
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
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography variant="h4" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        Welcome back, {user.full_name || user.username?.split('@')[0]} 👋
                        <Chip
                            icon={faceRegistered ? <CheckCircle /> : <Warning />}
                            label={faceRegistered ? "Face ID Active (Click to Reset)" : "Face ID Pending"}
                            color={faceRegistered ? "success" : "warning"}
                            variant="outlined"
                            onClick={() => faceRegistered ? handleFaceIdUpdate() : navigate('/dashboard/face-registration')}
                            sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}
                        />
                    </Typography>
                    <Typography color="text.secondary">
                        View your upcoming exams, past results, and profile
                    </Typography>
                </Box>
                <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<Videocam />}
                    onClick={() => navigate('/dashboard/pw-test')}
                    sx={{ borderRadius: 2, px: 3, py: 1 }}
                >
                    System & Environment Check
                </Button>
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
                                <Box sx={{ maxHeight: 320, overflowY: 'auto', pr: 1 }}>
                                    {upcomingExams.map((exam) => {
                                        const state = getExamState(exam);
                                        const session = mySessionMap[exam.id];
                                        const start = new Date(exam.start_time);

                                        const borderColor =
                                            state === 'ready' ? 'rgba(78,205,196,0.4)' :
                                                state === 'active' ? 'rgba(255,152,0,0.4)' :
                                                    state === 'completed' ? 'rgba(76,175,80,0.3)' :
                                                        state === 'invalidated' ? 'rgba(244,67,54,0.3)' :
                                                            state === 'ended' ? 'rgba(128,128,128,0.2)' : 'divider';
                                        const bgColor =
                                            state === 'ready' ? 'rgba(78,205,196,0.05)' :
                                                state === 'active' ? 'rgba(255,152,0,0.05)' :
                                                    state === 'completed' ? 'rgba(76,175,80,0.04)' : 'action.hover';

                                        return (
                                            <Box key={exam.id} sx={{
                                                p: 2, mb: 1.5, borderRadius: 2,
                                                border: '1px solid', borderColor, bgcolor: bgColor,
                                                transition: 'border-color 0.3s, background-color 0.3s',
                                            }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Box>
                                                        <Typography variant="body1" fontWeight={600}>{exam.title}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {exam.courses?.name} • {exam.duration_minutes} min • {start.toLocaleString()}
                                                        </Typography>
                                                    </Box>

                                                    {/* ── Per-state action ── */}
                                                    {state === 'ready' && (
                                                        <Button variant="contained" size="small" startIcon={<PlayArrow />}
                                                            onClick={() => navigate(`/dashboard/exam/${exam.id}`)}
                                                            sx={{ background: 'linear-gradient(135deg,#4ECDC4,#44B09E)', whiteSpace: 'nowrap' }}>
                                                            Start Exam
                                                        </Button>
                                                    )}
                                                    {state === 'active' && (
                                                        <Button variant="contained" size="small" startIcon={<PlayArrow />}
                                                            onClick={() => navigate(`/dashboard/exam/${exam.id}`)}
                                                            sx={{ background: 'linear-gradient(135deg,#FF9800,#F57C00)', whiteSpace: 'nowrap' }}>
                                                            Resume
                                                        </Button>
                                                    )}
                                                    {state === 'completed' && (
                                                        <Chip icon={<CheckCircle />}
                                                            label={session?.score != null ? `✓ ${session.score}/${session.totalMarks ?? '?'}` : '✓ Submitted'}
                                                            size="small" color="success" variant="outlined"
                                                            onClick={() => session?.sessionId && navigate(`/dashboard/results/${session.sessionId}`)}
                                                            sx={{ cursor: 'pointer' }} />
                                                    )}
                                                    {state === 'invalidated' && (
                                                        <Chip label="INVALIDATED" size="small" color="error" />
                                                    )}
                                                    {state === 'ended' && (
                                                        <Chip label="Session Ended" size="small" variant="outlined"
                                                            sx={{ color: 'text.disabled', borderColor: 'text.disabled' }} />
                                                    )}
                                                    {state === 'upcoming' && (
                                                        <Chip label={`Starts ${start.toLocaleDateString()}`} size="small" variant="outlined" />
                                                    )}
                                                </Box>
                                            </Box>
                                        );
                                    })}
                                </Box>

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
                                        <Box sx={{ maxHeight: 320, overflowY: 'auto', pr: 1 }}>
                                            {pastResults.map((result) => (
                                                <Box key={result.id}
                                                    onClick={() => navigate(`/dashboard/results/${result.id}`)}
                                                    sx={{
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        p: 1.5, mb: 1, borderRadius: 2,
                                                        bgcolor: result.status === 'invalidated' ? 'rgba(255, 77, 106, 0.05)' : 'action.hover',
                                                        cursor: 'pointer', transition: 'all 0.2s',
                                                        '&:hover': { bgcolor: 'action.selected' }
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
                                            ))}
                                        </Box>
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

import { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Chip, LinearProgress,
    Grid, Button, Divider, Alert, TextField, MenuItem
} from '@mui/material';
import { PlayArrow, CalendarMonth, AccessTime, Event } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import { useNavigate } from 'react-router-dom';

export default function StudentCalendar() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [tests, setTests] = useState([]);
    const [children, setChildren] = useState([]);
    const [selectedChild, setSelectedChild] = useState('');
    const [loading, setLoading] = useState(true);
    const isParent = user?.role === 'parent';

    useEffect(() => {
        if (isParent) {
            loadChildren();
        } else {
            loadTests(user.id);
        }
    }, [user]);

    const loadChildren = async () => {
        const { data } = await supabase.from('parent_student')
            .select('student_id, users!parent_student_student_id_fkey(id, username, email)')
            .eq('parent_id', user.id);

        const kids = data?.map(d => d.users) || [];
        setChildren(kids);
        if (kids.length > 0) {
            setSelectedChild(kids[0].id);
            loadTests(kids[0].id);
        } else {
            setLoading(false);
        }
    };

    const loadTests = async (studentId) => {
        try {
            // Get enrolled courses
            const { data: enrolled } = await supabase.from('enrollments').select('course_id').eq('student_id', studentId);
            const courseIds = enrolled?.map(e => e.course_id) || [];

            if (courseIds.length === 0) {
                setTests([]);
                setLoading(false);
                return;
            }

            // Get only upcoming/active tests (exclude expired)
            const now = new Date().toISOString();
            const { data } = await supabase
                .from('tests')
                .select('*, courses(name, code)')
                .in('course_id', courseIds)
                .gt('end_time', now)          // skip anything already expired
                .order('start_time', { ascending: true }); // nearest exam first

            setTests(data || []);
        } catch (error) {
            console.error('Error loading calendar:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatus = (test) => {
        const now = new Date();
        const start = new Date(test.start_time);
        const end = new Date(test.end_time);

        if (now < start) return { label: 'Upcoming', color: 'info' };
        if (now >= start && now <= end) return { label: 'Active', color: 'success' };
        return { label: 'Expired', color: 'default' };
    };

    const groupTestsByDate = () => {
        const groups = {};
        tests.forEach(test => {
            const date = new Date(test.start_time).toLocaleDateString(undefined, {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            if (!groups[date]) groups[date] = [];
            groups[date].push(test);
        });
        return groups;
    };

    if (loading) return <LinearProgress />;

    const grouped = groupTestsByDate();

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <CalendarMonth fontSize="large" color="primary" />
                    <Typography variant="h4" fontWeight={700}>
                        {isParent ? "Child's Exam Calendar" : "Exam Calendar"}
                    </Typography>
                </Box>
                {isParent && children.length > 0 && (
                    <TextField select label="Select Child" value={selectedChild}
                        onChange={e => {
                            setSelectedChild(e.target.value);
                            loadTests(e.target.value);
                        }} sx={{ width: 250 }}>
                        {children.map(s => (
                            <MenuItem key={s.id} value={s.id}>{s.username} — {s.email}</MenuItem>
                        ))}
                    </TextField>
                )}
            </Box>

            {tests.length === 0 ? (
                <Alert severity="info">You have no upcoming exams scheduled.</Alert>
            ) : (
                Object.entries(grouped).map(([date, dayTests]) => (
                    <Box key={date} sx={{ mb: 4 }}>
                        <Typography variant="h6" color="text.secondary" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Event fontSize="small" /> {date}
                        </Typography>
                        <Grid container spacing={3}>
                            {dayTests.map(test => {
                                const status = getStatus(test);
                                const isStartable = status.label === 'Active';

                                return (
                                    <Grid size={{ xs: 12, md: 6, lg: 4 }} key={test.id}>
                                        <Card sx={{
                                            borderLeft: `6px solid ${isStartable ? '#2e7d32' : '#1976d2'}`,
                                            height: '100%',
                                            transition: 'transform 0.2s',
                                            '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                                        }}>
                                            <CardContent>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                    <Chip label={test.courses?.code} size="small" variant="outlined" />
                                                    <Chip label={status.label} color={status.color} size="small" />
                                                </Box>

                                                <Typography variant="h6" fontWeight={600} gutterBottom>
                                                    {test.title}
                                                </Typography>

                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 2, fontSize: '0.9rem' }}>
                                                    <AccessTime fontSize="small" />
                                                    {new Date(test.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    {' - '}
                                                    {new Date(test.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    {' '}({test.duration_minutes} min)
                                                </Box>

                                                {isParent ? (
                                                    <Button fullWidth disabled variant="outlined">
                                                        {status.label}
                                                    </Button>
                                                ) : isStartable ? (
                                                    <Button
                                                        fullWidth
                                                        variant="contained"
                                                        color="success"
                                                        startIcon={<PlayArrow />}
                                                        onClick={() => navigate(`/dashboard/exam/${test.id}`)}
                                                    >
                                                        Start Exam
                                                    </Button>
                                                ) : (
                                                    <Button fullWidth disabled variant="outlined">
                                                        {status.label === 'Upcoming' ? 'Not Started' : 'Expired'}
                                                    </Button>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    </Box>
                ))
            )}
        </Box>
    );
}

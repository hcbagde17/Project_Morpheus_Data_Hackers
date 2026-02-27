import { useState, useEffect } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Chip, Button,
    List, ListItem, ListItemText, ListItemIcon, Avatar, Divider,
    LinearProgress,
} from '@mui/material';
import {
    School, Assignment, Flag, Add, Visibility,
} from '@mui/icons-material';
import { supabase } from '../../lib/supabase';
import useAuthStore from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

export default function TeacherDashboard() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [courses, setCourses] = useState([]);
    const [tests, setTests] = useState([]);
    const [pendingFlags, setPendingFlags] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Get courses assigned to this teacher
            const { data: coursesData } = await supabase
                .from('courses')
                .select('*, enrollments(count)')
                .eq('teacher_id', user.id)
                .eq('is_active', true);

            setCourses(coursesData || []);

            // Get tests created by teacher
            const { data: testsData } = await supabase
                .from('tests')
                .select('*')
                .eq('created_by', user.id)
                .order('start_time', { ascending: false })
                .limit(10);

            setTests(testsData || []);

            // Count unreviewed flags
            const { count } = await supabase
                .from('flags')
                .select('id', { count: 'exact', head: true })
                .eq('reviewed', false);

            setPendingFlags(count || 0);
        } catch (err) {
            console.error('Failed to load teacher data:', err);
        }
        setLoading(false);
    };

    if (loading) return <LinearProgress sx={{ borderRadius: 1 }} />;

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight={700} gutterBottom>Teacher Dashboard</Typography>
                <Typography color="text.secondary">Manage your courses, tests, and review student activity</Typography>
            </Box>

            {/* Stats */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(0, 217, 255, 0.1)' }}>
                                <School sx={{ color: '#00D9FF' }} />
                            </Box>
                            <Box>
                                <Typography variant="h4" fontWeight={700}>{courses.length}</Typography>
                                <Typography variant="body2" color="text.secondary">Assigned Courses</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(108, 99, 255, 0.1)' }}>
                                <Assignment sx={{ color: '#6C63FF' }} />
                            </Box>
                            <Box>
                                <Typography variant="h4" fontWeight={700}>{tests.length}</Typography>
                                <Typography variant="body2" color="text.secondary">Tests Created</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: pendingFlags > 0 ? 'rgba(255, 77, 106, 0.1)' : 'rgba(78, 205, 196, 0.1)' }}>
                                <Flag sx={{ color: pendingFlags > 0 ? '#FF4D6A' : '#4ECDC4' }} />
                            </Box>
                            <Box>
                                <Typography variant="h4" fontWeight={700}>{pendingFlags}</Typography>
                                <Typography variant="body2" color="text.secondary">Pending Flags</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                {/* Courses */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                <Typography variant="h6" fontWeight={600}>My Courses</Typography>
                            </Box>
                            {courses.length === 0 ? (
                                <Typography color="text.secondary" variant="body2">No courses assigned yet</Typography>
                            ) : (
                                <List disablePadding>
                                    {courses.map((course, idx) => (
                                        <Box key={course.id}>
                                            <ListItem sx={{ px: 0 }}>
                                                <ListItemIcon>
                                                    <Avatar sx={{ width: 36, height: 36, bgcolor: '#00D9FF22', color: '#00D9FF', fontSize: 14 }}>
                                                        {course.code?.slice(0, 2)}
                                                    </Avatar>
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={course.name}
                                                    secondary={`Code: ${course.code}`}
                                                />
                                                <Chip label={`${course.enrollments?.[0]?.count || 0} students`} size="small" variant="outlined" />
                                            </ListItem>
                                            {idx < courses.length - 1 && <Divider />}
                                        </Box>
                                    ))}
                                </List>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Recent Tests */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                <Typography variant="h6" fontWeight={600}>Recent Tests</Typography>
                                <Button size="small" startIcon={<Add />} onClick={() => navigate('/dashboard/tests/create')}>
                                    Create Test
                                </Button>
                            </Box>
                            {tests.length === 0 ? (
                                <Typography color="text.secondary" variant="body2">No tests created yet</Typography>
                            ) : (
                                <List disablePadding>
                                    {tests.map((test) => {
                                        const isUpcoming = new Date(test.start_time) > new Date();
                                        const isActive = new Date(test.start_time) <= new Date() && new Date(test.end_time) >= new Date();
                                        return (
                                            <Box key={test.id} sx={{ mb: 1 }}>
                                                <ListItem
                                                    disablePadding
                                                    sx={{
                                                        p: 2,
                                                        borderRadius: 2,
                                                        bgcolor: 'rgba(255,255,255,0.02)',
                                                        border: '1px solid rgba(148,163,184,0.06)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        flexWrap: 'wrap',
                                                    }}
                                                >
                                                    <ListItemText
                                                        primary={test.title}
                                                        secondary={
                                                            <Typography component="span" variant="body2" color="text.secondary">
                                                                {new Date(test.start_time).toLocaleDateString()} • {test.duration_minutes} mins
                                                                {isActive ?
                                                                    <Chip label="Active" size="small" color="success" sx={{ ml: 1, height: 20 }} /> :
                                                                    new Date(test.end_time) < new Date() ?
                                                                        <Chip label="Ended" size="small" sx={{ ml: 1, height: 20 }} /> :
                                                                        <Chip label="Upcoming" size="small" color="info" sx={{ ml: 1, height: 20 }} />
                                                                }
                                                            </Typography>
                                                        }
                                                    />
                                                    <Box sx={{ display: 'flex', gap: 1, mt: { xs: 1, sm: 0 } }}>
                                                        {isActive && (
                                                            <Button size="small" startIcon={<Visibility />} onClick={() => navigate('/dashboard/live-monitor')} sx={{ mr: 1 }}>
                                                                Monitor
                                                            </Button>
                                                        )}
                                                        <Button size="small" startIcon={<Assignment />} onClick={() => navigate(`/dashboard/test-results/${test.id}`)}>
                                                            Results
                                                        </Button>
                                                    </Box>
                                                </ListItem>
                                            </Box>
                                        );
                                    })}
                                </List>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}

import { useState, useEffect } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Chip, Button,
    Table, TableHead, TableRow, TableCell, TableBody,
    LinearProgress, IconButton, Tooltip, Avatar, Paper,
} from '@mui/material';
import {
    People, School, Assignment, Flag, TrendingUp,
    Warning, CheckCircle, PersonAdd, Upload,
    Visibility, Block, PlayArrow, Shield,
} from '@mui/icons-material';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

// Stat card component
function StatCard({ title, value, icon, color, subtitle }) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>{title}</Typography>
                        <Typography variant="h4" fontWeight={700}>{value}</Typography>
                        {subtitle && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{
                        p: 1.5, borderRadius: 3,
                        background: `${color}15`,
                        color: color,
                    }}>
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ users: 0, courses: 0, tests: 0, activeSessions: 0 });
    const [recentUsers, setRecentUsers] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [usersRes, coursesRes, testsRes, sessionsRes, recentRes] = await Promise.all([
                supabase.from('users').select('id', { count: 'exact', head: true }),
                supabase.from('courses').select('id', { count: 'exact', head: true }),
                supabase.from('tests').select('id', { count: 'exact', head: true }),
                supabase.from('exam_sessions').select('*').eq('status', 'in_progress'),
                supabase.from('users').select('*').order('created_at', { ascending: false }).limit(5),
            ]);

            setStats({
                users: usersRes.count || 0,
                courses: coursesRes.count || 0,
                tests: testsRes.count || 0,
                activeSessions: sessionsRes.data?.length || 0,
            });

            setRecentUsers(recentRes.data || []);
            setActiveSessions(sessionsRes.data || []);
        } catch (err) {
            console.error('Failed to load admin data:', err);
        }
        setLoading(false);
    };

    if (loading) return <LinearProgress sx={{ borderRadius: 1 }} />;

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                    Admin Dashboard
                </Typography>
                <Typography color="text.secondary">
                    Manage users, courses, and monitor examinations
                </Typography>
            </Box>

            {/* Stats */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <StatCard title="Total Users" value={stats.users} icon={<People />} color="#6C63FF"
                        subtitle="Students, Teachers, Parents" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <StatCard title="Courses" value={stats.courses} icon={<School />} color="#00D9FF" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <StatCard title="Tests Created" value={stats.tests} icon={<Assignment />} color="#4ECDC4" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <StatCard title="Active Sessions" value={stats.activeSessions} icon={<Visibility />} color="#FFB74D"
                        subtitle="Exams in progress" />
                </Grid>
            </Grid>

            {/* Quick Actions */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Card>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant="h6" fontWeight={600} gutterBottom>Quick Actions</Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                                <Button variant="outlined" startIcon={<PersonAdd />}
                                    onClick={() => navigate('/dashboard/users')}>
                                    Add User
                                </Button>
                                <Button variant="outlined" startIcon={<Upload />}
                                    onClick={() => navigate('/dashboard/users')}>
                                    Bulk Upload
                                </Button>
                                <Button variant="outlined" startIcon={<School />}
                                    onClick={() => navigate('/dashboard/courses')}>
                                    Create Course
                                </Button>
                                <Button variant="outlined" startIcon={<Flag />} color="warning"
                                    onClick={() => navigate('/dashboard/flags')}>
                                    Review Flags
                                </Button>
                                <Button variant="outlined" startIcon={<Shield />} color="error"
                                    onClick={() => navigate('/dashboard/blacklist')}>
                                    Manage Blacklist
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <Card>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant="h6" fontWeight={600} gutterBottom>Active Exam Sessions</Typography>
                            {activeSessions.length === 0 ? (
                                <Typography color="text.secondary" variant="body2">No active sessions</Typography>
                            ) : (
                                activeSessions.slice(0, 3).map((session) => (
                                    <Box key={session.id} sx={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        p: 1.5, mb: 1, borderRadius: 2, bgcolor: 'action.hover',
                                    }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PlayArrow sx={{ color: '#4ECDC4', fontSize: 18 }} />
                                            <Typography variant="body2">Session {session.id.slice(0, 8)}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <Chip label={`${session.red_flags || 0} Red`} size="small" color="error" variant="outlined" />
                                            <Chip label={`${session.orange_flags || 0} Orange`} size="small" color="warning" variant="outlined" />
                                        </Box>
                                    </Box>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Recent Users */}
            <Card>
                <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6" fontWeight={600}>Recent Users</Typography>
                        <Button size="small" onClick={() => navigate('/dashboard/users')}>View All</Button>
                    </Box>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>User</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {recentUsers.map((u) => (
                                <TableRow key={u.id} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Avatar sx={{ width: 30, height: 30, fontSize: 14 }}>
                                                {u.username?.charAt(0).toUpperCase()}
                                            </Avatar>
                                            {u.username}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={u.role} size="small" variant="outlined" />
                                    </TableCell>
                                    <TableCell>{u.email}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={u.is_active ? 'Active' : 'Inactive'}
                                            size="small"
                                            color={u.is_active ? 'success' : 'default'}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {recentUsers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="text.secondary">No users yet</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </Box>
    );
}

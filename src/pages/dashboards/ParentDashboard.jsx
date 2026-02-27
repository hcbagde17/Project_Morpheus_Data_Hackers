import { useState, useEffect } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Chip, LinearProgress,
    Avatar, List, ListItem, ListItemText, ListItemAvatar, Divider,
} from '@mui/material';
import { TrendingUp, CalendarMonth, ContactMail, CheckCircle, Warning, Person } from '@mui/icons-material';
import { supabase } from '../../lib/supabase';
import useAuthStore from '../../store/authStore';

export default function ParentDashboard() {
    const { user } = useAuthStore();
    const [children, setChildren] = useState([]);
    const [selectedChild, setSelectedChild] = useState(null);
    const [childData, setChildData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadChildren(); }, []);

    const loadChildren = async () => {
        try {
            const { data } = await supabase.from('parent_student')
                .select('student_id, users!parent_student_student_id_fkey(id, username, email)')
                .eq('parent_id', user.id);
            const kids = data?.map(d => d.users) || [];
            setChildren(kids);
            if (kids.length > 0) { setSelectedChild(kids[0]); await loadChildData(kids[0].id); }
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const loadChildData = async (childId) => {
        const { data: sessions } = await supabase.from('exam_sessions')
            .select('*, tests(title, total_marks, start_time, courses(name))')
            .eq('student_id', childId).order('started_at', { ascending: false }).limit(10);
        const { data: enrollments } = await supabase.from('enrollments').select('course_id').eq('student_id', childId);
        const courseIds = enrollments?.map(e => e.course_id) || [];
        let upcomingExams = [];
        if (courseIds.length > 0) {
            const { data } = await supabase.from('tests').select('*, courses(name)').in('course_id', courseIds)
                .gte('end_time', new Date().toISOString()).order('start_time').limit(5);
            upcomingExams = data || [];
        }
        const { data: teachers } = await supabase.from('courses')
            .select('name, users!courses_teacher_id_fkey(username, email, phone)').in('id', courseIds);
        const totalExams = (sessions?.length || 0) + (upcomingExams?.length || 0);
        const attendance = totalExams > 0 ? Math.round(((sessions?.length || 0) / totalExams) * 100) : 100;

        const cleanSessions = sessions?.filter(s => (s.red_flags || 0) === 0 && (s.orange_flags || 0) === 0).length || 0;
        const integrityScore = sessions?.length ? Math.round((cleanSessions / sessions.length) * 100) : 100;

        setChildData({
            sessions: sessions || [], upcomingExams, teachers: teachers || [],
            avgScore: sessions?.length ? Math.round(sessions.reduce((a, s) => a + (s.score || 0), 0) / sessions.length) : 0,
            integrityScore,
            attendance,
        });
    };

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight={700} gutterBottom>Parent Dashboard</Typography>
                <Typography color="text.secondary">Monitor your child's academic performance</Typography>
            </Box>
            {children.length === 0 ? (
                <Card><CardContent sx={{ textAlign: 'center', py: 6 }}>
                    <Person sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6">No children linked</Typography>
                    <Typography color="text.secondary">Contact admin to link your child's account.</Typography>
                </CardContent></Card>
            ) : (
                <>
                    {children.length > 1 && (
                        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                            {children.map(c => (
                                <Chip key={c.id} label={c.username} onClick={() => { setSelectedChild(c); loadChildData(c.id); }}
                                    variant={selectedChild?.id === c.id ? 'filled' : 'outlined'}
                                    color={selectedChild?.id === c.id ? 'primary' : 'default'} />
                            ))}
                        </Box>
                    )}
                    {childData && (
                        <Grid container spacing={3}>
                            <Grid size={{ xs: 12, sm: 3 }}><Card><CardContent sx={{ p: 3, textAlign: 'center' }}>
                                <TrendingUp sx={{ fontSize: 40, color: '#6C63FF', mb: 1 }} />
                                <Typography variant="h3" fontWeight={700}>{childData.avgScore}</Typography>
                                <Typography color="text.secondary">Avg Score</Typography>
                            </CardContent></Card></Grid>
                            <Grid size={{ xs: 12, sm: 3 }}><Card><CardContent sx={{ p: 3, textAlign: 'center' }}>
                                <CheckCircle sx={{ fontSize: 40, color: '#4ECDC4', mb: 1 }} />
                                <Typography variant="h3" fontWeight={700}>{childData.integrityScore}%</Typography>
                                <Typography color="text.secondary">Integrity</Typography>
                            </CardContent></Card></Grid>
                            <Grid size={{ xs: 12, sm: 3 }}><Card><CardContent sx={{ p: 3, textAlign: 'center' }}>
                                <Person sx={{ fontSize: 40, color: '#00D9FF', mb: 1 }} />
                                <Typography variant="h3" fontWeight={700}>{childData.attendance}%</Typography>
                                <Typography color="text.secondary">Attendance</Typography>
                            </CardContent></Card></Grid>
                            <Grid size={{ xs: 12, sm: 3 }}><Card><CardContent sx={{ p: 3, textAlign: 'center' }}>
                                <Warning sx={{ fontSize: 40, color: '#FFB74D', mb: 1 }} />
                                <Typography variant="h3" fontWeight={700}>{childData.sessions.length}</Typography>
                                <Typography color="text.secondary">Exams Taken</Typography>
                            </CardContent></Card></Grid>
                            <Grid size={{ xs: 12, md: 6 }}><Card><CardContent sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                    <CalendarMonth color="primary" />
                                    <Typography variant="h6" fontWeight={600}>Upcoming Exams</Typography>
                                </Box>
                                {childData.upcomingExams.length === 0 ? <Typography color="text.secondary" variant="body2">None</Typography> :
                                    childData.upcomingExams.map(e => (
                                        <Box key={e.id} sx={{ p: 2, mb: 1, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                                            <Typography variant="body2" fontWeight={600}>{e.title}</Typography>
                                            <Typography variant="caption" color="text.secondary">{e.courses?.name} • {new Date(e.start_time).toLocaleString()}</Typography>
                                        </Box>
                                    ))}
                            </CardContent></Card></Grid>
                            <Grid size={{ xs: 12, md: 6 }}><Card><CardContent sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                    <ContactMail color="primary" />
                                    <Typography variant="h6" fontWeight={600}>Teacher Contacts</Typography>
                                </Box>
                                {childData.teachers.length === 0 ? <Typography color="text.secondary" variant="body2">None</Typography> :
                                    <List disablePadding>{childData.teachers.map((tc, i) => (
                                        <ListItem key={i} sx={{ px: 0 }}>
                                            <ListItemAvatar><Avatar sx={{ bgcolor: '#00D9FF22', color: '#00D9FF' }}>{tc.users?.username?.[0] || 'T'}</Avatar></ListItemAvatar>
                                            <ListItemText primary={tc.users?.username} secondary={`${tc.name} • ${tc.users?.email}`} />
                                        </ListItem>
                                    ))}</List>}
                            </CardContent></Card></Grid>
                        </Grid>
                    )}
                </>
            )}
        </Box>
    );
}

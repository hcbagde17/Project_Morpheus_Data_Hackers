import { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Chip, Grid, Table, TableHead,
    TableRow, TableCell, TableBody, LinearProgress, TextField,
    MenuItem, Avatar, Divider, Paper,
} from '@mui/material';
import {
    TrendingUp, TrendingDown, EmojiEvents, Assignment,
    CheckCircle, Cancel, Schedule,
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

import { useNavigate } from 'react-router-dom';

export default function StudentPerformance() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [sessions, setSessions] = useState([]);
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState('');
    const [loading, setLoading] = useState(true);
    const isTeacherOrAdmin = ['admin', 'teacher', 'technical'].includes(user?.role);
    const isParent = user?.role === 'parent';

    useEffect(() => {
        if (isTeacherOrAdmin) {
            loadStudents();
        } else if (isParent) {
            loadChildren();
        } else {
            loadPerformance(user.id);
        }
    }, [user]);

    const loadStudents = async () => {
        const { data } = await supabase.from('users').select('id, username, full_name, email')
            .eq('role', 'student').order('username');
        setStudents(data || []);
        if (data?.length > 0) {
            setSelectedStudent(data[0].id);
            loadPerformance(data[0].id);
        } else {
            setLoading(false);
        }
    };

    const loadChildren = async () => {
        // Step 1: get the student IDs linked to this parent
        const { data: links, error: linkErr } = await supabase
            .from('parent_student')
            .select('student_id')
            .eq('parent_id', user.id);

        if (linkErr) {
            console.error('[ParentPerformance] parent_student query failed:', linkErr);
            setLoading(false);
            return;
        }

        const studentIds = (links || []).map(l => l.student_id);
        console.log('[ParentPerformance] Children IDs:', studentIds);

        if (studentIds.length === 0) {
            console.warn('[ParentPerformance] No children linked to this parent.');
            setLoading(false);
            return;
        }

        // Step 2: fetch the user records for those student IDs
        const { data: kids, error: kidsErr } = await supabase
            .from('users')
            .select('id, username, full_name, email')
            .in('id', studentIds);

        if (kidsErr) {
            console.error('[ParentPerformance] users query failed:', kidsErr);
            setLoading(false);
            return;
        }

        console.log('[ParentPerformance] Children found:', kids);
        setStudents(kids || []);
        if (kids && kids.length > 0) {
            setSelectedStudent(kids[0].id);
            loadPerformance(kids[0].id);
        } else {
            setLoading(false);
        }
    };

    const loadPerformance = async (studentId) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('exam_sessions')
                .select('*, tests(title, total_marks, duration_minutes, courses(name))')
                .eq('student_id', studentId)
                // Include all non-active statuses so terminated/invalidated sessions are visible
                .in('status', ['submitted', 'completed', 'terminated', 'invalidated'])
                .order('ended_at', { ascending: false });

            if (error) {
                console.error('[ParentPerformance] exam_sessions query failed:', error);
            } else {
                console.log(`[ParentPerformance] Sessions for ${studentId}:`, data);
            }
            setSessions(data || []);
        } catch (err) {
            console.error('[ParentPerformance] Unexpected error:', err);
        }
        setLoading(false);
    };

    const handleStudentChange = (id) => {
        setSelectedStudent(id);
        loadPerformance(id);
    };

    // Calculate stats
    const totalExams = sessions.length;
    const avgScore = totalExams > 0
        ? Math.round(sessions.reduce((a, s) => a + ((s.score || 0) / (s.tests?.total_marks || 1)) * 100, 0) / totalExams)
        : 0;
    const bestScore = totalExams > 0
        ? Math.max(...sessions.map(s => ((s.score || 0) / (s.tests?.total_marks || 1)) * 100))
        : 0;
    const totalFlags = sessions.reduce((a, s) => a + (s.red_flags || 0) + (s.orange_flags || 0), 0);
    const passRate = totalExams > 0
        ? Math.round(sessions.filter(s => (s.score || 0) / (s.tests?.total_marks || 1) >= 0.4).length / totalExams * 100)
        : 0;

    const getScoreColor = (score, total) => {
        const pct = (score / total) * 100;
        if (pct >= 75) return '#4ECDC4';
        if (pct >= 50) return '#6C63FF';
        if (pct >= 40) return '#FFB74D';
        return '#FF4D6A';
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>
                        {isTeacherOrAdmin ? 'Student Performance History' : isParent ? "Child's Performance" : 'My Performance'}
                    </Typography>
                    <Typography color="text.secondary">
                        {isTeacherOrAdmin ? 'View detailed exam history for any student' : isParent ? 'Track your child\'s exam results and progress' : 'Track your exam results and progress'}
                    </Typography>
                </Box>
                {(isTeacherOrAdmin || isParent) && students.length > 0 && (
                    <TextField select label={isParent ? "Select Child" : "Select Student"} value={selectedStudent}
                        onChange={e => handleStudentChange(e.target.value)} sx={{ width: 250 }}>
                        {students.map(s => (
                            <MenuItem key={s.id} value={s.id}>{s.full_name || s.username} — {s.email}</MenuItem>
                        ))}
                    </TextField>
                )}
            </Box>

            {loading ? <LinearProgress /> : (
                <>
                    {/* Stats */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 6, md: 2.4 }}>
                            <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                                <Assignment color="primary" />
                                <Typography variant="h4" fontWeight={700}>{totalExams}</Typography>
                                <Typography variant="caption" color="text.secondary">Exams Taken</Typography>
                            </CardContent></Card>
                        </Grid>
                        <Grid size={{ xs: 6, md: 2.4 }}>
                            <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                                <TrendingUp sx={{ color: '#6C63FF' }} />
                                <Typography variant="h4" fontWeight={700}>{avgScore}%</Typography>
                                <Typography variant="caption" color="text.secondary">Avg Score</Typography>
                            </CardContent></Card>
                        </Grid>
                        <Grid size={{ xs: 6, md: 2.4 }}>
                            <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                                <EmojiEvents sx={{ color: '#FFB74D' }} />
                                <Typography variant="h4" fontWeight={700}>{Math.round(bestScore)}%</Typography>
                                <Typography variant="caption" color="text.secondary">Best Score</Typography>
                            </CardContent></Card>
                        </Grid>
                        <Grid size={{ xs: 6, md: 2.4 }}>
                            <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                                <CheckCircle sx={{ color: '#4ECDC4' }} />
                                <Typography variant="h4" fontWeight={700}>{passRate}%</Typography>
                                <Typography variant="caption" color="text.secondary">Pass Rate</Typography>
                            </CardContent></Card>
                        </Grid>
                        <Grid size={{ xs: 6, md: 2.4 }}>
                            <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                                <Cancel sx={{ color: totalFlags > 0 ? '#FF4D6A' : '#4ECDC4' }} />
                                <Typography variant="h4" fontWeight={700}>{totalFlags}</Typography>
                                <Typography variant="caption" color="text.secondary">Total Flags</Typography>
                            </CardContent></Card>
                        </Grid>
                    </Grid>

                    {/* Progress Bar */}
                    {totalExams > 0 && (
                        <Card sx={{ mb: 3 }}><CardContent sx={{ p: 2 }}>
                            <Typography variant="body2" fontWeight={600} gutterBottom>Average Score</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LinearProgress variant="determinate" value={avgScore}
                                    sx={{ flex: 1, height: 10, borderRadius: 1, '& .MuiLinearProgress-bar': { bgcolor: getScoreColor(avgScore, 100) } }} />
                                <Typography variant="body2" fontWeight={700}>{avgScore}%</Typography>
                            </Box>
                        </CardContent></Card>
                    )}

                    {/* Exam History Table */}
                    <Card><CardContent sx={{ p: 0 }}>
                        <Table>
                            <TableHead><TableRow>
                                <TableCell>Exam</TableCell><TableCell>Course</TableCell><TableCell>Date</TableCell>
                                <TableCell>Score</TableCell><TableCell>Percentage</TableCell><TableCell>Flags</TableCell>
                            </TableRow></TableHead>
                            <TableBody>
                                {sessions.map(s => {
                                    const pct = Math.round(((s.score || 0) / (s.tests?.total_marks || 1)) * 100);
                                    return (
                                        <TableRow key={s.id} hover
                                            onClick={() => navigate(`/dashboard/results/${s.id}`)}
                                            sx={{ cursor: 'pointer', bgcolor: s.status === 'invalidated' ? 'rgba(255, 77, 106, 0.05)' : 'inherit' }}>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600}>{s.tests?.title}</Typography>
                                                <Typography variant="caption" color="text.secondary">{s.tests?.duration_minutes} min</Typography>
                                                {s.status === 'invalidated' && (
                                                    <Chip label="INVALIDATED" size="small" color="error" sx={{ ml: 1, height: 20, fontSize: 10 }} />
                                                )}
                                            </TableCell>
                                            <TableCell>{s.tests?.courses?.name || '—'}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2">{s.ended_at ? new Date(s.ended_at).toLocaleDateString() : '—'}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {s.ended_at ? new Date(s.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                {s.status === 'invalidated' ? (
                                                    <Typography variant="body2" fontWeight={700} color="error">VOID</Typography>
                                                ) : (
                                                    <Typography variant="body2" fontWeight={700} sx={{ color: getScoreColor(s.score || 0, s.tests?.total_marks || 1) }}>
                                                        {s.score || 0} / {s.tests?.total_marks || 0}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {s.status === 'invalidated' ? (
                                                    <Typography variant="body2" fontWeight={600} color="error">—</Typography>
                                                ) : (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <LinearProgress variant="determinate" value={pct}
                                                            sx={{ width: 60, height: 6, borderRadius: 1, '& .MuiLinearProgress-bar': { bgcolor: getScoreColor(s.score || 0, s.tests?.total_marks || 1) } }} />
                                                        <Typography variant="body2" fontWeight={600}>{pct}%</Typography>
                                                    </Box>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                    {(s.red_flags || 0) > 0 && <Chip label={`${s.red_flags} R`} size="small" color="error" variant="outlined" />}
                                                    {(s.orange_flags || 0) > 0 && <Chip label={`${s.orange_flags} O`} size="small" color="warning" variant="outlined" />}
                                                    {!s.red_flags && !s.orange_flags && <Chip label="Clean" size="small" color="success" variant="outlined" />}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {sessions.length === 0 && (
                                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                                        <Assignment sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                                        <Typography color="text.secondary">No exam history found</Typography>
                                    </TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent></Card>
                </>
            )}
        </Box>
    );
}

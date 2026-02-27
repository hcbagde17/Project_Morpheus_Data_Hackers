import { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Chip, LinearProgress,
    Table, TableHead, TableRow, TableCell, TableBody, Button, IconButton,
} from '@mui/material';
import { Assignment, PlayArrow, Visibility, ContentCopy } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import { useNavigate } from 'react-router-dom';

export default function TestList() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadTests(); }, []);

    const loadTests = async () => {
        let query = supabase.from('tests').select('*, courses(name, code)').order('start_time', { ascending: false });
        if (user.role === 'teacher') query = query.eq('created_by', user.id);
        if (user.role === 'student') {
            const { data: enrolled } = await supabase.from('enrollments').select('course_id').eq('student_id', user.id);
            const ids = enrolled?.map(e => e.course_id) || [];
            if (ids.length > 0) query = query.in('course_id', ids);
            else { setTests([]); setLoading(false); return; }
        }
        const { data } = await query.limit(50);
        setTests(data || []);
        setLoading(false);
    };



    const handleDuplicate = async (testId) => {
        const { data: test } = await supabase.from('tests').select('*').eq('id', testId).single();
        const { data: questions } = await supabase.from('questions').select('*').eq('test_id', testId);
        navigate('/dashboard/tests/create', { state: { duplicateData: { test, questions } } });
    };

    const getStatus = (test) => {
        const now = new Date();
        if (now < new Date(test.start_time)) return { label: 'Upcoming', color: 'info' };
        if (now >= new Date(test.start_time) && now <= new Date(test.end_time)) return { label: 'Active', color: 'success' };
        return { label: 'Completed', color: 'default' };
    };

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4" fontWeight={700}>Tests</Typography>
                {['teacher', 'admin', 'technical'].includes(user.role) && (
                    <Button variant="contained" onClick={() => navigate('/dashboard/tests/create')}>Create Test</Button>
                )}
            </Box>
            <Card><CardContent sx={{ p: 0 }}>
                <Table>
                    <TableHead><TableRow>
                        <TableCell>Test</TableCell><TableCell>Course</TableCell><TableCell>Duration</TableCell>
                        <TableCell>Schedule</TableCell><TableCell>Status</TableCell><TableCell>Action</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                        {tests.map(t => {
                            const status = getStatus(t);
                            const canStart = user.role === 'student' && status.label === 'Active';
                            return (
                                <TableRow key={t.id} hover>
                                    <TableCell><Typography variant="body2" fontWeight={600}>{t.title}</Typography></TableCell>
                                    <TableCell><Chip label={t.courses?.code || '—'} size="small" /></TableCell>
                                    <TableCell>{t.duration_minutes} min</TableCell>
                                    <TableCell>
                                        <Typography variant="caption">{new Date(t.start_time).toLocaleString()}</Typography><br />
                                        <Typography variant="caption" color="text.secondary">to {new Date(t.end_time).toLocaleString()}</Typography>
                                    </TableCell>
                                    <TableCell><Chip label={status.label} size="small" color={status.color} /></TableCell>
                                    <TableCell>
                                        {canStart && <Button size="small" variant="contained" startIcon={<PlayArrow />}
                                            onClick={() => navigate(`/dashboard/exam/${t.id}`)}>Start</Button>}
                                        {!canStart && (
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <IconButton size="small" onClick={() => navigate(`/dashboard/test-results/${t.id}`)} title="View Results">
                                                    <Visibility />
                                                </IconButton>
                                                {['teacher', 'admin'].includes(user.role) && (
                                                    <IconButton size="small" onClick={() => handleDuplicate(t.id)} title="Duplicate Test">
                                                        <ContentCopy />
                                                    </IconButton>
                                                )}
                                            </Box>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {tests.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>No tests found</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent></Card>
        </Box>
    );
}

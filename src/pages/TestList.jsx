import { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Chip, LinearProgress,
    Table, TableHead, TableRow, TableCell, TableBody, Button, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
    Select, MenuItem, InputLabel, FormControl, CircularProgress
} from '@mui/material';
import { Assignment, PlayArrow, Visibility, Delete, Download } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import { useNavigate } from 'react-router-dom';

export default function TestList() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);

    const [courses, setCourses] = useState([]);

    useEffect(() => { loadTests(); }, []);

    const loadTests = async () => {
        let query = supabase.from('tests').select('*, courses(name, code)').order('start_time', { ascending: false });
        if (user.role === 'teacher') {
            query = query.eq('created_by', user.id);
            const { data: cData } = await supabase.from('courses').select('id, name').eq('teacher_id', user.id);
            setCourses(cData || []);
        }
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



    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [testToDelete, setTestToDelete] = useState(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [exportCourseId, setExportCourseId] = useState('');
    const [exporting, setExporting] = useState(false);

    const handleExportCourseCSV = async () => {
        if (!exportCourseId) return;
        setExporting(true);
        try {
            // 1. Fetch all tests for this course
            const { data: courseTests } = await supabase.from('tests')
                .select('id, title, total_marks').eq('course_id', exportCourseId).order('start_time', { ascending: true });

            // 2. Fetch all enrolled students for this course
            const { data: enrollments } = await supabase.from('enrollments')
                .select('users!enrollments_student_id_fkey(id, full_name, username)')
                .eq('course_id', exportCourseId);
            const enrolledStudents = enrollments?.map(e => e.users) || [];

            // 3. Fetch all exam sessions for these tests
            let sessions = [];
            if (courseTests?.length > 0) {
                const testIds = courseTests.map(t => t.id);
                const { data: sessData } = await supabase.from('exam_sessions').select('*').in('test_id', testIds);
                sessions = sessData || [];
            }

            // CSV Building
            let csvContent = "Student Name,";
            csvContent += courseTests.map(t => `"${t.title.replace(/"/g, '""')}"`).join(',') + "\n";

            enrolledStudents.forEach(student => {
                const studentName = `"${(student.full_name || student.username || '').replace(/"/g, '""')}"`;
                let rowCols = [];

                courseTests.forEach(test => {
                    const session = sessions.find(s => s.student_id === student.id && s.test_id === test.id);
                    if (!session) {
                        rowCols.push('"Not Attempted"');
                    } else if (session.red_flags > 0) {
                        rowCols.push('"Exam Cancelled"');
                    } else {
                        const scoreStr = session.score !== null ? session.score : "Pending";
                        rowCols.push(`"${scoreStr} / ${test.total_marks}"`);
                    }
                });

                csvContent += `${studentName},${rowCols.join(',')}\n`;
            });

            // Trigger Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const selectedCourse = courses.find(c => c.id === exportCourseId);
            const cName = selectedCourse ? selectedCourse.name.replace(/[^a-z0-9]/gi, '_') : 'Course';
            link.setAttribute("download", `${cName}_Report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setExportOpen(false);
            setExportCourseId('');
        } catch (err) {
            console.error("Course Export Failed:", err);
            alert("Failed to export Course CSV.");
        }
        setExporting(false);
    };

    const handleDelete = async () => {
        if (!testToDelete) return;
        try {
            // Delete test (cascade should handle related records if DB is set up, otherwise we manually delete)
            await supabase.from('test_questions').delete().eq('test_id', testToDelete);
            await supabase.from('exam_sessions').delete().eq('test_id', testToDelete);
            await supabase.from('tests').delete().eq('id', testToDelete);

            setDeleteConfirmOpen(false);
            setTestToDelete(null);
            loadTests();
        } catch (err) {
            console.error("Failed to delete test:", err);
        }
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
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        {user.role === 'teacher' && (
                            <Button variant="outlined" startIcon={<Download />} onClick={() => setExportOpen(true)}>
                                Export Course Report
                            </Button>
                        )}
                        <Button variant="contained" onClick={() => navigate('/dashboard/tests/create')}>Create Test</Button>
                    </Box>
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
                                                    <IconButton size="small" onClick={() => { setTestToDelete(t.id); setDeleteConfirmOpen(true); }} title="Delete Test" color="error">
                                                        <Delete />
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
            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                <DialogTitle>Delete Test</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to completely delete this test? This will also erase any attached student exam sessions, flags, and grades. This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={exportOpen} onClose={() => !exporting && setExportOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Export Course CSV Report</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        Select a course to generate a matrix report of all enrolled students and their scores across every test in this course.
                    </DialogContentText>
                    <FormControl fullWidth>
                        <InputLabel>Select Course</InputLabel>
                        <Select
                            value={exportCourseId}
                            label="Select Course"
                            onChange={(e) => setExportCourseId(e.target.value)}
                            disabled={exporting}
                        >
                            {courses.map(c => (
                                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleExportCourseCSV}
                        disabled={!exportCourseId || exporting}
                        startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
                    >
                        {exporting ? 'Generating...' : 'Export'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

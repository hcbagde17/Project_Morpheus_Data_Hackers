import { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Button, TextField, Dialog, DialogTitle,
    DialogContent, DialogActions, Table, TableHead, TableRow, TableCell, TableBody,
    Chip, MenuItem, Alert, LinearProgress, Avatar, IconButton, Tooltip,
    List, ListItem, ListItemButton, ListItemText, Checkbox
} from '@mui/material';
import { School, Add, Edit, Delete, People } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

export default function CourseManagement() {
    const { user } = useAuthStore();
    const [courses, setCourses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [enrollOpen, setEnrollOpen] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [error, setError] = useState('');
    const [form, setForm] = useState({ name: '', code: '', description: '', teacher_id: '' });
    const [enrolledStudentIds, setEnrolledStudentIds] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const isAdmin = ['admin', 'technical'].includes(user?.role);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        let query = supabase.from('courses').select('*, users!courses_teacher_id_fkey(username), enrollments(count)');
        if (user.role === 'teacher') query = query.eq('teacher_id', user.id);
        if (user.role === 'student') {
            const { data: enrolled } = await supabase.from('enrollments').select('course_id').eq('student_id', user.id);
            const ids = enrolled?.map(e => e.course_id) || [];
            if (ids.length > 0) query = query.in('id', ids);
            else { setCourses([]); setLoading(false); return; }
        }
        const { data } = await query.order('created_at', { ascending: false });
        setCourses(data || []);
        if (isAdmin) {
            const { data: t } = await supabase.from('users').select('id, username').eq('role', 'teacher');
            setTeachers(t || []);
            const { data: s } = await supabase.from('users').select('id, username, full_name, email').eq('role', 'student');
            setStudents(s || []);
        }
        setLoading(false);
    };

    const handleCreate = async () => {
        setError('');
        try {
            const { data: inst } = await supabase.from('institutions').select('id').limit(1);
            const { error: err } = await supabase.from('courses').insert({
                ...form, institution_id: inst?.[0]?.id, is_active: true,
                teacher_id: form.teacher_id || null,
            });
            if (err) throw err;
            setOpen(false); setForm({ name: '', code: '', description: '', teacher_id: '' }); loadData();
        } catch (err) { setError(err.message); }
    };

    const fetchEnrollments = async (course) => {
        try {
            const { data } = await supabase.from('enrollments')
                .select('student_id').eq('course_id', course.id);
            setEnrolledStudentIds(new Set(data?.map(e => e.student_id) || []));
        } catch (err) { console.error('Error fetching enrollments:', err); }
    };

    const handleToggleEnrollment = async (studentId, isEnrolled) => {
        if (!selectedCourse) return;
        try {
            if (isEnrolled) {
                // Unenroll
                await supabase.from('enrollments')
                    .delete()
                    .eq('course_id', selectedCourse.id)
                    .eq('student_id', studentId);
            } else {
                // Enroll
                await supabase.from('enrollments')
                    .insert({ course_id: selectedCourse.id, student_id: studentId });
            }
            // Update local set for instant UI response
            setEnrolledStudentIds(prev => {
                const newSet = new Set(prev);
                isEnrolled ? newSet.delete(studentId) : newSet.add(studentId);
                return newSet;
            });
            loadData(); // Update background table counts
        } catch (err) { console.error(err); }
    };

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight={700}>Courses</Typography>
                {isAdmin && <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>Create Course</Button>}
            </Box>

            <Card><CardContent sx={{ p: 0 }}>
                <Table>
                    <TableHead><TableRow>
                        <TableCell>Course</TableCell><TableCell>Code</TableCell><TableCell>Teacher</TableCell>
                        <TableCell>Students</TableCell>{isAdmin && <TableCell>Actions</TableCell>}
                    </TableRow></TableHead>
                    <TableBody>
                        {courses.map(c => (
                            <TableRow key={c.id} hover>
                                <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Avatar sx={{ width: 32, height: 32, bgcolor: '#00D9FF22', color: '#00D9FF', fontSize: 12 }}>{c.code?.slice(0, 2)}</Avatar>
                                    <Box><Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">{c.description || ''}</Typography></Box>
                                </Box></TableCell>
                                <TableCell><Chip label={c.code} size="small" /></TableCell>
                                <TableCell>{c.users?.username || '—'}</TableCell>
                                <TableCell><Chip label={c.enrollments?.[0]?.count || 0} size="small" variant="outlined" /></TableCell>
                                {isAdmin && <TableCell>
                                    <Tooltip title="Manage Students">
                                        <IconButton size="small" onClick={() => {
                                            setSelectedCourse(c);
                                            setSearchQuery('');
                                            fetchEnrollments(c);
                                            setEnrollOpen(true);
                                        }}>
                                            <People fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>}
                            </TableRow>
                        ))}
                        {courses.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">No courses yet</Typography>
                        </TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent></Card>

            {/* Create Course Dialog */}
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create Course</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <TextField fullWidth label="Course Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
                    <TextField fullWidth label="Course Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} sx={{ mb: 2 }} />
                    <TextField fullWidth label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} sx={{ mb: 2 }} multiline rows={2} />
                    <TextField fullWidth select label="Assign Teacher" value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })}>
                        <MenuItem value="">None</MenuItem>
                        {teachers.map(t => <MenuItem key={t.id} value={t.id}>{t.username}</MenuItem>)}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleCreate}>Create</Button>
                </DialogActions>
            </Dialog>

            {/* Enroll Dialog */}
            <Dialog open={enrollOpen} onClose={() => setEnrollOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Manage Students — {selectedCourse?.name}</DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Search by name or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </Box>
                    <List sx={{ pt: 0, maxHeight: 400, overflow: 'auto' }}>
                        {students
                            .filter(s => (s.full_name || s.username).toLowerCase().includes(searchQuery.toLowerCase()) || (s.email || '').toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(s => {
                                const isEnrolled = enrolledStudentIds.has(s.id);
                                return (
                                    <ListItem key={s.id} disablePadding>
                                        <ListItemButton onClick={() => handleToggleEnrollment(s.id, isEnrolled)}>
                                            <Checkbox
                                                edge="start"
                                                checked={isEnrolled}
                                                tabIndex={-1}
                                                disableRipple
                                            />
                                            <ListItemText
                                                primary={s.full_name || s.username}
                                                secondary={s.email}
                                                secondaryTypographyProps={{ fontSize: '0.8rem' }}
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                );
                            })}
                        {students.length === 0 && (
                            <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">
                                No students found.
                            </Typography>
                        )}
                    </List>
                </DialogContent>
                <DialogActions><Button onClick={() => setEnrollOpen(false)}>Close</Button></DialogActions>
            </Dialog>
        </Box>
    );
}

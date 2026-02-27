import { useState, useEffect, useRef } from 'react';
import {
    Box, Card, CardContent, Typography, Button, TextField, Dialog, DialogTitle,
    DialogContent, DialogActions, Table, TableHead, TableRow, TableCell, TableBody,
    Chip, IconButton, MenuItem, Alert, LinearProgress, Tooltip, Avatar, Divider, Tabs, Tab,
} from '@mui/material';
import { PersonAdd, Upload, Edit, Block, CheckCircle, Search, Download, FamilyRestroom, School } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const emptyForm = { full_name: '', email: '', phone: '', role: 'student', parent_name: '', parent_email: '', parent_phone: '' };

export default function UserManagement() {
    const { user: currentUser } = useAuthStore();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const [csvOpen, setCsvOpen] = useState(false);
    const [csvTab, setCsvTab] = useState(0); // 0 = general, 1 = students
    const [csvResult, setCsvResult] = useState(null);
    const [error, setError] = useState('');
    const fileRef = useRef();
    const [form, setForm] = useState({ ...emptyForm });

    const canManage = ['admin', 'technical'].includes(currentUser?.role);

    useEffect(() => { loadUsers(); }, []);

    const loadUsers = async () => {
        const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        setUsers(data || []);
        setLoading(false);
    };

    const generateUsername = (email) => {
        const local = email.split('@')[0];
        return `${local}@pw.com`;
    };

    // Helper: create a single user and return the record
    const createUser = async (full_name, email, phone, role) => {
        const username = generateUsername(email);
        const passwordHash = await hashPassword(phone);
        const { data, error } = await supabase.from('users').insert({
            email, username, phone, full_name, role, password_hash: passwordHash, first_login: true,
        }).select().single();
        if (error) throw error;
        return data;
    };

    // Helper: link parent ↔ student
    const linkParentStudent = async (parentId, studentId) => {
        await supabase.from('parent_student').insert({ parent_id: parentId, student_id: studentId });
    };

    const handleCreate = async () => {
        setError('');
        try {
            // Create the main user
            const user = await createUser(form.full_name, form.email, form.phone, form.role);

            // If student and parent info provided, create and link parent
            if (form.role === 'student' && form.parent_email?.trim()) {
                // Check if parent already exists
                const { data: existing } = await supabase.from('users').select('id')
                    .eq('email', form.parent_email.trim()).limit(1);

                let parentId;
                if (existing && existing.length > 0) {
                    parentId = existing[0].id;
                } else {
                    const parent = await createUser(
                        form.parent_name || '', form.parent_email.trim(),
                        form.parent_phone || form.phone, 'parent'
                    );
                    parentId = parent.id;
                }
                await linkParentStudent(parentId, user.id);
            }

            await supabase.from('audit_logs').insert({
                action: 'USER_CREATED', user_id: currentUser.id,
                details: { email: form.email, role: form.role },
            });
            setOpen(false);
            setForm({ ...emptyForm });
            loadUsers();
        } catch (err) { setError(err.message); }
    };

    // General CSV handler (teachers, parents, admins, etc.)
    const handleCSVUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        let success = 0, failed = 0, errors = [];
        for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(',').map(v => v.trim());
            const row = {};
            headers.forEach((h, j) => { row[h] = vals[j]; });
            try {
                await createUser(row.full_name || row.name || '', row.email, row.phone, row.role || 'student');
                success++;
            } catch (err) { failed++; errors.push(`Row ${i}: ${err.message}`); }
        }
        setCsvResult({ success, failed, errors });
        loadUsers();
    };

    // Student CSV handler (with parent columns)
    const handleStudentCSVUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        let success = 0, failed = 0, errors = [];
        for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(',').map(v => v.trim());
            const row = {};
            headers.forEach((h, j) => { row[h] = vals[j]; });
            try {
                // Create student
                const student = await createUser(row.student_name || '', row.student_email, row.student_phone, 'student');

                // Create or find parent and link
                if (row.parent_email?.trim()) {
                    const { data: existing } = await supabase.from('users').select('id')
                        .eq('email', row.parent_email.trim()).limit(1);

                    let parentId;
                    if (existing && existing.length > 0) {
                        parentId = existing[0].id;
                    } else {
                        const parent = await createUser(
                            row.parent_name || '', row.parent_email.trim(),
                            row.parent_phone || row.student_phone, 'parent'
                        );
                        parentId = parent.id;
                    }
                    await linkParentStudent(parentId, student.id);
                }
                success++;
            } catch (err) { failed++; errors.push(`Row ${i}: ${err.message}`); }
        }
        setCsvResult({ success, failed, errors });
        loadUsers();
    };

    const downloadTemplate = (type) => {
        let template;
        let filename;
        if (type === 'general') {
            template = 'full_name,email,phone,role\nJohn Doe,john@example.com,9876543210,teacher\nJane Smith,jane@example.com,9876543211,admin';
            filename = 'users_template.csv';
        } else {
            template = 'student_name,student_email,student_phone,parent_name,parent_email,parent_phone\nRahul Kumar,rahul@example.com,9876543210,Suresh Kumar,suresh@example.com,9876543200\nPriya Singh,priya@example.com,9876543211,Meena Singh,meena@example.com,9876543201';
            filename = 'students_with_parents_template.csv';
        }
        const blob = new Blob([template], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleActive = async (userId, active) => {
        await supabase.from('users').update({ is_active: !active }).eq('id', userId);
        loadUsers();
    };

    const filtered = users.filter(u =>
        (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        u.username?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.role?.includes(search.toLowerCase())
    );

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight={700}>User Management</Typography>
                {canManage && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button variant="contained" startIcon={<PersonAdd />} onClick={() => setOpen(true)}>Add User</Button>
                        <Button variant="outlined" startIcon={<Upload />} onClick={() => setCsvOpen(true)}>CSV Upload</Button>
                    </Box>
                )}
            </Box>

            <TextField fullWidth placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
                InputProps={{ startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} /> }} sx={{ mb: 3 }} size="small" />

            <Card>
                <CardContent sx={{ p: 0 }}>
                    <Table>
                        <TableHead><TableRow>
                            <TableCell>User</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell>
                            <TableCell>Status</TableCell>{canManage && <TableCell>Actions</TableCell>}
                        </TableRow></TableHead>
                        <TableBody>
                            {filtered.map(u => (
                                <TableRow key={u.id} hover>
                                    <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Avatar sx={{ width: 32, height: 32 }}>{(u.full_name || u.username)?.[0]?.toUpperCase()}</Avatar>
                                        <Box>
                                            <Typography variant="body2" fontWeight={600}>{u.full_name || u.username}</Typography>
                                            <Typography variant="caption" color="text.secondary">{u.username}</Typography>
                                        </Box>
                                    </Box></TableCell>
                                    <TableCell>{u.email}</TableCell>
                                    <TableCell><Chip label={u.role} size="small" variant="outlined" /></TableCell>
                                    <TableCell><Chip label={u.is_active ? 'Active' : 'Inactive'} size="small" color={u.is_active ? 'success' : 'default'} /></TableCell>
                                    {canManage && <TableCell>
                                        <Tooltip title={u.is_active ? 'Deactivate' : 'Activate'}>
                                            <IconButton size="small" onClick={() => toggleActive(u.id, u.is_active)}>
                                                {u.is_active ? <Block fontSize="small" /> : <CheckCircle fontSize="small" />}
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Create User Dialog */}
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create User</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <TextField fullWidth label="Full Name" value={form.full_name}
                        onChange={e => setForm({ ...form, full_name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
                    <TextField fullWidth label="Email" value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })} sx={{ mb: 2 }} />
                    <TextField fullWidth label="Phone (Default Password)" value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value })} sx={{ mb: 2 }} />
                    <TextField fullWidth select label="Role" value={form.role}
                        onChange={e => setForm({ ...form, role: e.target.value })}>
                        <MenuItem value="student">Student</MenuItem>
                        <MenuItem value="teacher">Teacher</MenuItem>
                        <MenuItem value="parent">Parent</MenuItem>
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="technical">Technical</MenuItem>
                    </TextField>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Username: {form.email ? generateUsername(form.email) : '—'}
                    </Typography>

                    {/* Parent Details (only shown for students) */}
                    {form.role === 'student' && (
                        <Box sx={{ mt: 3 }}>
                            <Divider sx={{ mb: 2 }} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <FamilyRestroom fontSize="small" color="primary" />
                                <Typography variant="subtitle2" color="primary">Parent / Guardian Details</Typography>
                            </Box>
                            <TextField fullWidth label="Parent Name" value={form.parent_name}
                                onChange={e => setForm({ ...form, parent_name: e.target.value })} sx={{ mb: 2 }} size="small" />
                            <TextField fullWidth label="Parent Email" value={form.parent_email}
                                onChange={e => setForm({ ...form, parent_email: e.target.value })} sx={{ mb: 2 }} size="small"
                                helperText="A parent account will be auto-created if it doesn't exist" />
                            <TextField fullWidth label="Parent Phone" value={form.parent_phone}
                                onChange={e => setForm({ ...form, parent_phone: e.target.value })} size="small"
                                helperText="Used as parent's default password" />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleCreate}>Create</Button>
                </DialogActions>
            </Dialog>

            {/* CSV Upload Dialog with Tabs */}
            <Dialog open={csvOpen} onClose={() => { setCsvOpen(false); setCsvResult(null); setCsvTab(0); }} maxWidth="sm" fullWidth>
                <DialogTitle>Bulk Upload (CSV)</DialogTitle>
                <DialogContent>
                    <Tabs value={csvTab} onChange={(_, v) => { setCsvTab(v); setCsvResult(null); }} sx={{ mb: 2 }}>
                        <Tab icon={<PersonAdd />} label="General" iconPosition="start" sx={{ minHeight: 48 }} />
                        <Tab icon={<School />} label="Students + Parents" iconPosition="start" sx={{ minHeight: 48 }} />
                    </Tabs>

                    {/* Tab 0: General CSV */}
                    {csvTab === 0 && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                For teachers, admins, or any role. CSV columns: <b>full_name, email, phone, role</b>
                            </Typography>
                            <Button variant="outlined" size="small" startIcon={<Download />}
                                sx={{ mb: 2 }} onClick={() => downloadTemplate('general')}>
                                Download Template
                            </Button>
                            <br />
                            <input type="file" accept=".csv" onChange={handleCSVUpload} ref={fileRef} />
                        </Box>
                    )}

                    {/* Tab 1: Students + Parents CSV */}
                    {csvTab === 1 && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                Creates student accounts with linked parent accounts automatically.
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                CSV columns: <b>student_name, student_email, student_phone, parent_name, parent_email, parent_phone</b>
                            </Typography>
                            <Alert severity="info" sx={{ mb: 2, py: 0 }}>
                                If a parent email already exists, the student will be linked to the existing parent.
                            </Alert>
                            <Button variant="outlined" size="small" startIcon={<Download />}
                                sx={{ mb: 2 }} onClick={() => downloadTemplate('students')}>
                                Download Student Template
                            </Button>
                            <br />
                            <input type="file" accept=".csv" onChange={handleStudentCSVUpload} />
                        </Box>
                    )}

                    {csvResult && (
                        <Box sx={{ mt: 2 }}>
                            <Alert severity={csvResult.failed > 0 ? 'warning' : 'success'}>
                                {csvResult.success} created, {csvResult.failed} failed
                            </Alert>
                            {csvResult.errors.map((e, i) => (
                                <Typography key={i} variant="caption" color="error" display="block">{e}</Typography>
                            ))}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setCsvOpen(false); setCsvResult(null); setCsvTab(0); }}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

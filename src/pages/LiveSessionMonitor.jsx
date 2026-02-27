import { useState, useEffect, useRef } from 'react';
import {
    Box, Card, CardContent, Typography, Chip, Button, Table, TableHead,
    TableRow, TableCell, TableBody, LinearProgress, Grid, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, Alert,
    IconButton, Tooltip, Avatar, Badge,
} from '@mui/material';
import {
    Visibility, PauseCircle, PlayArrow, StopCircle, Refresh,
    Flag, Warning, CheckCircle, Person, Timer,
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

export default function LiveSessionMonitor() {
    const { user } = useAuthStore();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState(null);
    const [actionDialog, setActionDialog] = useState(false);
    const [actionType, setActionType] = useState('');
    const [actionReason, setActionReason] = useState('');
    const [success, setSuccess] = useState('');
    const refreshInterval = useRef(null);

    useEffect(() => {
        loadSessions();
        // Auto-refresh every 10 seconds
        refreshInterval.current = setInterval(loadSessions, 10000);
        return () => { if (refreshInterval.current) clearInterval(refreshInterval.current); };
    }, []);

    const loadSessions = async () => {
        try {
            const { data } = await supabase
                .from('exam_sessions')
                .select('*, tests(title, duration_minutes, start_time, courses(name)), users:student_id(username, email)')
                .in('status', ['in_progress', 'paused'])
                .order('started_at', { ascending: false });

            // Fetch flag counts per session
            const enriched = await Promise.all((data || []).map(async (s) => {
                const { count: flagCount } = await supabase
                    .from('flags').select('id', { count: 'exact', head: true }).eq('session_id', s.id);
                const elapsed = (Date.now() - new Date(s.started_at).getTime()) / 60000;
                const remaining = Math.max(0, (s.tests?.duration_minutes || 0) - elapsed);
                return { ...s, flagCount: flagCount || 0, minutesRemaining: Math.floor(remaining) };
            }));

            setSessions(enriched);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const handleAction = async () => {
        if (!selectedSession || !actionType) return;
        try {
            if (actionType === 'suspend') {
                await supabase.from('exam_sessions').update({ status: 'paused' }).eq('id', selectedSession.id);
            } else if (actionType === 'resume') {
                await supabase.from('exam_sessions').update({ status: 'in_progress' }).eq('id', selectedSession.id);
            } else if (actionType === 'terminate') {
                await supabase.from('exam_sessions').update({
                    status: 'terminated', ended_at: new Date().toISOString(),
                }).eq('id', selectedSession.id);
            }

            await supabase.from('audit_logs').insert({
                action: `SESSION_${actionType.toUpperCase()}`,
                user_id: user.id,
                target_id: selectedSession.id,
                target_type: 'exam_session',
                details: { reason: actionReason, student: selectedSession.users?.username },
            });

            setSuccess(`Session ${actionType}d successfully`);
            setActionDialog(false);
            setActionReason('');
            loadSessions();
        } catch (err) { console.error(err); }
    };

    const openAction = (session, type) => {
        setSelectedSession(session);
        setActionType(type);
        setActionDialog(true);
    };

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Live Session Monitor</Typography>
                    <Typography color="text.secondary">
                        {sessions.length} active session{sessions.length !== 1 ? 's' : ''} — auto-refreshes every 10s
                    </Typography>
                </Box>
                <Button startIcon={<Refresh />} onClick={loadSessions} variant="outlined">Refresh Now</Button>
            </Box>

            {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

            {/* Overview Stats */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                    <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h3" fontWeight={700} color="primary">{sessions.filter(s => s.status === 'in_progress').length}</Typography>
                        <Typography variant="caption" color="text.secondary">In Progress</Typography>
                    </CardContent></Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h3" fontWeight={700} sx={{ color: '#FFB74D' }}>{sessions.filter(s => s.status === 'paused').length}</Typography>
                        <Typography variant="caption" color="text.secondary">Paused</Typography>
                    </CardContent></Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h3" fontWeight={700} sx={{ color: '#FF4D6A' }}>{sessions.reduce((a, s) => a + s.red_flags, 0)}</Typography>
                        <Typography variant="caption" color="text.secondary">Total Red Flags</Typography>
                    </CardContent></Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                    <Card><CardContent sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h3" fontWeight={700} sx={{ color: '#FFB74D' }}>{sessions.reduce((a, s) => a + s.orange_flags, 0)}</Typography>
                        <Typography variant="caption" color="text.secondary">Total Orange Flags</Typography>
                    </CardContent></Card>
                </Grid>
            </Grid>

            {/* Sessions Table */}
            <Card><CardContent sx={{ p: 0 }}>
                <Table>
                    <TableHead><TableRow>
                        <TableCell>Student</TableCell><TableCell>Test</TableCell><TableCell>Time Left</TableCell>
                        <TableCell>Status</TableCell><TableCell>Flags</TableCell><TableCell>Actions</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                        {sessions.map(s => (
                            <TableRow key={s.id} hover sx={{ bgcolor: s.red_flags > 2 ? 'rgba(255,77,106,0.04)' : 'inherit' }}>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Badge badgeContent={s.flagCount} color="error" max={99}>
                                            <Avatar sx={{ width: 32, height: 32 }}>{s.users?.username?.[0]?.toUpperCase()}</Avatar>
                                        </Badge>
                                        <Box>
                                            <Typography variant="body2" fontWeight={600}>{s.users?.username}</Typography>
                                            <Typography variant="caption" color="text.secondary">{s.users?.email}</Typography>
                                        </Box>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2">{s.tests?.title}</Typography>
                                    <Typography variant="caption" color="text.secondary">{s.tests?.courses?.name}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Timer sx={{ fontSize: 16, color: s.minutesRemaining < 5 ? '#FF4D6A' : 'text.secondary' }} />
                                        <Typography variant="body2" sx={{ color: s.minutesRemaining < 5 ? '#FF4D6A' : 'inherit', fontFamily: 'monospace' }}>
                                            {s.minutesRemaining} min
                                        </Typography>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Chip label={s.status === 'in_progress' ? 'Active' : 'Paused'} size="small"
                                        color={s.status === 'in_progress' ? 'success' : 'warning'} />
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        <Chip label={`${s.red_flags} R`} size="small" color="error" variant="outlined" />
                                        <Chip label={`${s.orange_flags} O`} size="small" color="warning" variant="outlined" />
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        {s.status === 'in_progress' ? (
                                            <Tooltip title="Suspend"><IconButton size="small" color="warning"
                                                onClick={() => openAction(s, 'suspend')}><PauseCircle fontSize="small" /></IconButton></Tooltip>
                                        ) : (
                                            <Tooltip title="Resume"><IconButton size="small" color="success"
                                                onClick={() => openAction(s, 'resume')}><PlayArrow fontSize="small" /></IconButton></Tooltip>
                                        )}
                                        <Tooltip title="Terminate"><IconButton size="small" color="error"
                                            onClick={() => openAction(s, 'terminate')}><StopCircle fontSize="small" /></IconButton></Tooltip>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                        {sessions.length === 0 && (
                            <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                                <Visibility sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                                <Typography color="text.secondary">No active exam sessions</Typography>
                            </TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent></Card>

            {/* Action Dialog */}
            <Dialog open={actionDialog} onClose={() => setActionDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ textTransform: 'capitalize' }}>{actionType} Session</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Student: <strong>{selectedSession?.users?.username}</strong> | Test: <strong>{selectedSession?.tests?.title}</strong>
                    </Typography>
                    <TextField fullWidth multiline rows={3} label="Reason (required)" value={actionReason}
                        onChange={e => setActionReason(e.target.value)} placeholder="Enter reason for this action..." />
                    {actionType === 'terminate' && (
                        <Alert severity="warning" sx={{ mt: 2 }}>This will end the student's exam immediately and cannot be undone.</Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setActionDialog(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleAction} disabled={!actionReason.trim()}
                        color={actionType === 'terminate' ? 'error' : actionType === 'suspend' ? 'warning' : 'success'}>
                        Confirm {actionType}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

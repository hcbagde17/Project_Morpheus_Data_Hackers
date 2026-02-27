import { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Chip, LinearProgress,
    Table, TableHead, TableRow, TableCell, TableBody, Button, TextField,
    Dialog, DialogTitle, DialogContent, DialogActions, MenuItem,
    IconButton, Tooltip, Paper, Grid, Alert,
} from '@mui/material';
import {
    Flag, CheckCircle, Warning, Visibility, FilterList,
    PlayArrow, Videocam, Person, Schedule, Info,
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';

import useAuthStore from '../store/authStore';

export default function FlagReview() {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [courses, setCourses] = useState([]);
    const [tests, setTests] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState('all');
    const [selectedTest, setSelectedTest] = useState('all');
    const [filtersLoaded, setFiltersLoaded] = useState(false);

    const [reviewOpen, setReviewOpen] = useState(false);
    const [selectedFlag, setSelectedFlag] = useState(null);
    const [reviewAction, setReviewAction] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');

    useEffect(() => { loadFilters(); }, []);

    const loadFilters = async () => {
        try {
            let courseQuery = supabase.from('courses').select('id, name').eq('is_active', true);
            if (isTeacher) courseQuery = courseQuery.eq('teacher_id', user.id);
            const { data: cData } = await courseQuery;
            setCourses(cData || []);

            let testQuery = supabase.from('tests').select('id, title, course_id');
            if (isTeacher && cData?.length > 0) {
                testQuery = testQuery.in('course_id', cData.map(c => c.id));
            } else if (isTeacher && (!cData || cData.length === 0)) {
                setTests([]);
                setFiltersLoaded(true);
                return;
            }
            const { data: tData } = await testQuery;
            setTests(tData || []);
        } catch (err) { console.error("Filter load error:", err); }
        setFiltersLoaded(true);
    };

    useEffect(() => { if (filtersLoaded) loadFlags(); }, [filter, selectedCourse, selectedTest, filtersLoaded]);

    const loadFlags = async () => {
        setLoading(true);
        if (isTeacher && courses.length === 0) {
            setFlags([]);
            setLoading(false);
            return;
        }

        let query = supabase
            .from('flags')
            .select('*, exam_sessions!inner(student_id, test_id, tests!inner(title, course_id))')
            .order('timestamp', { ascending: false })
            .limit(100);

        if (isTeacher) {
            query = query.in('exam_sessions.tests.course_id', courses.map(c => c.id));
        }

        if (selectedTest !== 'all') {
            query = query.eq('exam_sessions.test_id', selectedTest);
        } else if (selectedCourse !== 'all') {
            query = query.eq('exam_sessions.tests.course_id', selectedCourse);
        }

        if (filter === 'high') {
            query = query.in('severity', ['high', 'RED']);
        } else if (filter === 'medium') {
            query = query.in('severity', ['medium', 'ORANGE', 'YELLOW']);
        } else if (filter === 'low') {
            query = query.in('severity', ['low']);
        }

        if (filter === 'escalated') query = query.eq('review_action', 'escalate');
        if (filter === 'unreviewed') query = query.eq('reviewed', false);

        const { data } = await query;
        setFlags(data || []);
        setLoading(false);
    };

    const handleReview = async () => {
        if (!selectedFlag) return;

        // Update flag status
        await supabase.from('flags').update({
            reviewed: true,
            review_action: reviewAction,
            review_notes: reviewNotes,
        }).eq('id', selectedFlag.id);

        // Handle Exam Invalidation
        if (reviewAction === 'invalidate' && isAdmin) {
            await supabase.from('exam_sessions').update({
                status: 'invalidated',
                score: 0,
                ended_at: new Date().toISOString()
            }).eq('id', selectedFlag.session_id);

            // Create audit log
            await supabase.from('audit_logs').insert({
                action: 'EXAM_INVALIDATED',
                user_id: user.id,
                details: {
                    session_id: selectedFlag.session_id,
                    reason: reviewNotes,
                    flag_id: selectedFlag.id
                }
            });
        }

        setReviewOpen(false);
        setSelectedFlag(null);
        setReviewAction('');
        setReviewNotes('');
        loadFlags();
    };

    // Stats
    const totalFlags = flags.length;
    const highFlags = flags.filter(f => f.severity === 'high' || f.severity === 'RED').length;
    const mediumFlags = flags.filter(f => f.severity === 'medium' || f.severity === 'ORANGE' || f.severity === 'YELLOW').length;
    const unreviewedFlags = flags.filter(f => !f.reviewed).length;

    if (loading) return <LinearProgress />;

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
                <Typography variant="h4" fontWeight={700}>
                    <Flag sx={{ mr: 1, verticalAlign: 'middle', color: '#FF4D6A' }} />
                    Flag Review
                </Typography>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                    { label: 'Total Flags', value: totalFlags, color: '#6C63FF' },
                    { label: 'High Severity', value: highFlags, color: '#FF4D6A' },
                    { label: 'Medium Severity', value: mediumFlags, color: '#FF9800' },
                    { label: 'Unreviewed', value: unreviewedFlags, color: '#FFC107' },
                ].map(stat => (
                    <Grid size={{ xs: 6, md: 3 }} key={stat.label}>
                        <Paper sx={{ p: 2, textAlign: 'center', borderTop: `3px solid ${stat.color}` }}>
                            <Typography variant="h4" fontWeight={700} color={stat.color}>{stat.value}</Typography>
                            <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField select size="small" label="Course Filter" value={selectedCourse}
                    onChange={e => { setSelectedCourse(e.target.value); setSelectedTest('all'); }}
                    sx={{ minWidth: 200 }}>
                    <MenuItem value="all">All Courses</MenuItem>
                    {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </TextField>

                <TextField select size="small" label="Test Filter" value={selectedTest}
                    onChange={e => setSelectedTest(e.target.value)}
                    sx={{ minWidth: 200 }}>
                    <MenuItem value="all">All Tests</MenuItem>
                    {tests.filter(t => selectedCourse === 'all' || t.course_id === selectedCourse).map(t =>
                        <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>
                    )}
                </TextField>

                <Box sx={{ flexGrow: 1 }} />

                <Box sx={{ display: 'flex', gap: 1 }}>
                    {[
                        { key: 'all', label: 'All', color: 'default' },
                        { key: 'high', label: '🔴 High', color: 'error' },
                        { key: 'medium', label: '🟠 Medium', color: 'warning' },
                        { key: 'low', label: '🟡 Low', color: 'default' },
                        { key: 'unreviewed', label: 'Unreviewed', color: 'info' },
                        { key: 'escalated', label: 'Escalated', color: 'error' },
                    ].map(f => (
                        <Chip
                            key={f.key}
                            label={f.label}
                            onClick={() => setFilter(f.key)}
                            size="small"
                            variant={filter === f.key ? 'filled' : 'outlined'}
                            color={f.color}
                        />
                    ))}
                </Box>
            </Box>

            {/* Flags Table */}
            <Card>
                <CardContent sx={{ p: 0 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'rgba(108,99,255,0.05)' }}>
                                <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Severity</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Test</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Evidence</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {flags.map(f => (
                                <TableRow
                                    key={f.id}
                                    hover
                                    sx={{
                                        borderLeft: (f.severity === 'high' || f.severity === 'RED') ? '3px solid #FF4D6A' :
                                            (f.severity === 'medium' || f.severity === 'ORANGE' || f.severity === 'YELLOW') ? '3px solid #FF9800' : '3px solid #ccc'
                                    }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                            {f.type || f.flag_type}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={f.severity}
                                            size="small"
                                            color={(f.severity === 'high' || f.severity === 'RED') ? 'error' : (f.severity === 'medium' || f.severity === 'ORANGE' || f.severity === 'YELLOW') ? 'warning' : 'default'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption" sx={{ maxWidth: 200, display: 'block' }}>
                                            {f.metadata?.message || '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{f.exam_sessions?.tests?.title || '—'}</TableCell>
                                    <TableCell>
                                        <Typography variant="caption">
                                            {f.timestamp ? new Date(f.timestamp).toLocaleString() : '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {f.evidence_url ? (
                                            <Tooltip title="View Evidence">
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={() => { setSelectedFlag(f); setReviewOpen(true); }}
                                                >
                                                    <PlayArrow />
                                                </IconButton>
                                            </Tooltip>
                                        ) : (
                                            <Typography variant="caption" color="text.disabled">—</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {f.reviewed ? (
                                            <Chip label="Reviewed" size="small" color="success" icon={<CheckCircle />} />
                                        ) : (
                                            <Chip label="Pending" size="small" color="warning" variant="outlined" />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            size="small"
                                            variant={f.reviewed ? 'text' : 'contained'}
                                            onClick={() => { setSelectedFlag(f); setReviewOpen(true); }}
                                        >
                                            {f.reviewed ? 'View' : 'Review'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {flags.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                                        <Info sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
                                        <Typography variant="body2" color="text.secondary">
                                            No flags found matching this filter.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Review Dialog */}
            <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning color={(selectedFlag?.severity === 'high' || selectedFlag?.severity === 'RED') ? 'error' : 'warning'} />
                    Review Flag: {selectedFlag?.type || selectedFlag?.flag_type}
                </DialogTitle>
                <DialogContent>
                    {/* Flag Details */}
                    <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(108,99,255,0.03)', borderRadius: 2 }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}>
                                <Typography variant="body2"><strong>Type:</strong> {selectedFlag?.type || selectedFlag?.flag_type}</Typography>
                                <Typography variant="body2"><strong>Severity:</strong> {selectedFlag?.severity}</Typography>
                                <Typography variant="body2"><strong>Time:</strong> {selectedFlag?.timestamp ? new Date(selectedFlag.timestamp).toLocaleString() : '—'}</Typography>
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                                <Typography variant="body2"><strong>Test:</strong> {selectedFlag?.exam_sessions?.tests?.title || '—'}</Typography>
                                <Typography variant="body2"><strong>Message:</strong> {selectedFlag?.metadata?.message || '—'}</Typography>
                            </Grid>
                        </Grid>
                    </Paper>

                    {/* Evidence Video */}
                    {selectedFlag?.evidence_url ? (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Videocam fontSize="small" /> Evidence Video
                            </Typography>
                            <Box sx={{ bgcolor: '#000', borderRadius: 2, overflow: 'hidden', maxHeight: 400 }}>
                                <video
                                    src={selectedFlag.evidence_url}
                                    controls
                                    style={{ width: '100%', maxHeight: 400 }}
                                />
                            </Box>
                        </Box>
                    ) : (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            No video evidence available for this flag.
                        </Alert>
                    )}

                    {/* Show form if unreviewed OR if it's an escalated flag viewed by Admin */}
                    {(!selectedFlag?.reviewed || (isAdmin && selectedFlag?.review_action === 'escalate')) && (
                        <>
                            <TextField
                                fullWidth
                                select
                                label="Action"
                                value={reviewAction}
                                onChange={e => setReviewAction(e.target.value)}
                                sx={{ mb: 2 }}
                            >
                                <MenuItem value="dismiss">Dismiss — No Action</MenuItem>
                                <MenuItem value="warn">Warn Student</MenuItem>
                                {isAdmin && <MenuItem value="invalidate">Invalidate Exam (Zero Score)</MenuItem>}
                                {!isAdmin && <MenuItem value="escalate">Escalate to Admin</MenuItem>}
                            </TextField>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Review Notes"
                                value={reviewNotes}
                                onChange={e => setReviewNotes(e.target.value)}
                                placeholder="Add notes about this flag..."
                            />
                        </>
                    )}

                    {selectedFlag?.reviewed && selectedFlag?.review_action !== 'escalate' && (
                        <Alert severity="success" sx={{ mt: 2 }}>
                            <strong>Reviewed</strong> — Action: {selectedFlag.review_action || 'N/A'}
                            {selectedFlag.review_notes && <Typography variant="body2" sx={{ mt: 1 }}>{selectedFlag.review_notes}</Typography>}
                        </Alert>
                    )}

                    {/* Show info for Escalated flags if Admin is viewing (before they act) */}
                    {selectedFlag?.review_action === 'escalate' && (
                        <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
                            <strong>Escalated by Teacher</strong>
                            {selectedFlag.review_notes && <Typography variant="body2" sx={{ mt: 1 }}>Teacher Notes: {selectedFlag.review_notes}</Typography>}
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReviewOpen(false)}>Close</Button>
                    {(!selectedFlag?.reviewed || (isAdmin && selectedFlag?.review_action === 'escalate')) && (
                        <Button variant="contained" onClick={handleReview} disabled={!reviewAction}>
                            Submit Review
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
}

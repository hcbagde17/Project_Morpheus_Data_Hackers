import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Button, Table, TableHead,
    TableRow, TableCell, TableBody, LinearProgress, Chip, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import { ArrowBack, CheckCircle, Edit, Save, Download } from '@mui/icons-material';
import { supabase } from '../lib/supabase';

export default function TestResults() {
    const { testId } = useParams();
    const navigate = useNavigate();
    const [test, setTest] = useState(null);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editOpen, setEditOpen] = useState(false);
    const [selectedResult, setSelectedResult] = useState(null);
    const [tempScore, setTempScore] = useState(0);
    const [feedback, setFeedback] = useState('');

    useEffect(() => { loadResults(); }, [testId]);

    const loadResults = async () => {
        try {
            // Get test details
            const { data: testData } = await supabase.from('tests').select('*').eq('id', testId).single();
            setTest(testData);

            // Get all sessions (results)
            const { data: sessionData } = await supabase
                .from('exam_sessions')
                .select('*, users:student_id(username, email)')
                .eq('test_id', testId)
                .order('score', { ascending: false });

            setResults(sessionData || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const handleEdit = (result) => {
        setSelectedResult(result);
        setTempScore(result.score || 0);
        setFeedback(result.feedback || '');
        setEditOpen(true);
    };

    const handleSave = async () => {
        try {
            await supabase.from('exam_sessions').update({
                score: parseFloat(tempScore),
                // feedback: feedback, // Assuming we add a feedback column or store in json
            }).eq('id', selectedResult.id);
            setEditOpen(false);
            loadResults();
        } catch (err) { console.error(err); }
    };

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back</Button>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>{test?.title} — Results</Typography>
                    <Typography color="text.secondary">Total Marks: {test?.total_marks} | Participants: {results.length}</Typography>
                </Box>
                <Button variant="outlined" startIcon={<Download />}>Export CSV</Button>
            </Box>

            <Card><CardContent sx={{ p: 0 }}>
                <Table>
                    <TableHead><TableRow>
                        <TableCell>Student</TableCell><TableCell>Status</TableCell><TableCell>Submitted At</TableCell>
                        <TableCell>Score</TableCell><TableCell>%</TableCell><TableCell>Actions</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                        {results.map(r => (
                            <TableRow key={r.id} hover>
                                <TableCell>
                                    <Typography variant="body2" fontWeight={600}>{r.users?.username}</Typography>
                                    <Typography variant="caption" color="text.secondary">{r.users?.email}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip label={r.status} size="small"
                                        color={r.status === 'completed' ? 'success' : r.status === 'in_progress' ? 'primary' : 'default'} />
                                </TableCell>
                                <TableCell>{r.ended_at ? new Date(r.ended_at).toLocaleString() : '—'}</TableCell>
                                <TableCell>
                                    <Typography fontWeight={700}>{r.score ?? '—'} / {test?.total_marks}</Typography>
                                </TableCell>
                                <TableCell>
                                    {r.score !== null ? Math.round((r.score / test?.total_marks) * 100) + '%' : '—'}
                                </TableCell>
                                <TableCell>
                                    <IconButton size="small" onClick={() => handleEdit(r)}><Edit fontSize="small" /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {results.length === 0 && <TableRow><TableCell colSpan={6} align="center">No results yet</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent></Card>

            <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
                <DialogTitle>Manual Grading</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>Adjust score for <strong>{selectedResult?.users?.username}</strong></Typography>
                    <TextField label="Score" type="number" fullWidth value={tempScore}
                        onChange={e => setTempScore(e.target.value)} sx={{ mt: 2, mb: 2 }} />
                    <TextField label="Feedback (Private)" multiline rows={3} fullWidth value={feedback}
                        onChange={e => setFeedback(e.target.value)} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave}>Save Changes</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

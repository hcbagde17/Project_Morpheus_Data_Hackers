import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Button, Table, TableHead,
    TableRow, TableCell, TableBody, LinearProgress, CircularProgress, Chip, IconButton,
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
    const [exporting, setExporting] = useState(false);

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

    const handleExportCSV = async () => {
        if (!test) return;
        setExporting(true);
        try {
            // 1. Fetch all questions for columns via junction table
            const { data: qData } = await supabase.from('test_questions')
                .select('questions(*)')
                .eq('test_id', testId).order('question_order', { ascending: true });
            const safeQuestions = qData?.map(q => q.questions).filter(Boolean) || [];

            // 2. Fetch all enrolled students for this test's course
            const { data: enrollments } = await supabase.from('enrollments')
                .select('users!enrollments_student_id_fkey(id, full_name, username)')
                .eq('course_id', test.course_id);
            const enrolledStudents = enrollments?.map(e => e.users) || [];

            // 3. Fetch all exam sessions for this test
            const { data: sessions } = await supabase.from('exam_sessions')
                .select('*').eq('test_id', testId);

            // 4. Fetch all answers for these sessions
            const sessionIds = sessions?.map(s => s.id) || [];
            let answers = [];
            if (sessionIds.length > 0) {
                const { data: ansData } = await supabase.from('answers').select('*').in('session_id', sessionIds);
                answers = ansData || [];
            }

            // CSV Building
            let csvContent = "";
            const qCols = safeQuestions.map(q => `"${(q.question_text || '').replace(/"/g, '""')}"`).join(',');

            // Header Row
            csvContent += `Student Name,${qCols},Marks Obtained,Total Marks\n`;

            // Correct Answers Row
            const correctCols = safeQuestions.map(q => {
                let ans = q.correct_answer;
                if (Array.isArray(ans)) ans = ans.join(' | ');
                return `"${(ans || '').toString().replace(/"/g, '""')}"`;
            }).join(',');
            csvContent += `Correct Answers,${correctCols},,\n`;

            // Student Rows
            enrolledStudents.forEach(student => {
                // Determine name
                const studentName = `"${(student.full_name || student.username || '').replace(/"/g, '""')}"`;

                // Find session
                const session = sessions?.find(s => s.student_id === student.id);

                if (!session) {
                    // Not attempted
                    const emptyCols = safeQuestions.map(() => '""').join(',');
                    csvContent += `${studentName},${emptyCols},"Not Attempted",""\n`;
                    return;
                }

                if (session.red_flags > 0) {
                    // Exam Cancelled due to red flags
                    const emptyCols = safeQuestions.map(() => '""').join(',');
                    csvContent += `${studentName},${emptyCols},"Exam Cancelled",""\n`;
                    return;
                }

                // Normal parsing
                const studentAnswers = safeQuestions.map(q => {
                    const ansRecord = answers.find(a => a.session_id === session.id && a.question_id === q.id);
                    let val = ansRecord?.selected_answer;
                    if (Array.isArray(val)) val = val.join(' | ');
                    return `"${(val || '').toString().replace(/"/g, '""')}"`;
                }).join(',');

                // Score
                const scoreStr = session.score !== null ? session.score : "Pending";
                csvContent += `${studentName},${studentAnswers},"${scoreStr}","${test.total_marks}"\n`;
            });

            // Trigger Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Test_Results_${test.title.replace(/[^a-z0-9]/gi, '_')}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error("Export Failed:", err);
            alert("Failed to export CSV. See console.");
        }
        setExporting(false);
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
                <Button variant="outlined" startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
                    onClick={handleExportCSV} disabled={exporting}>
                    {exporting ? 'Exporting...' : 'Export CSV'}
                </Button>
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

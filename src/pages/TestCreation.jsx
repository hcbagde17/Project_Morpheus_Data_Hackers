import { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Button, TextField, MenuItem,
    IconButton, Alert, Grid, Chip, Divider, Switch, FormControlLabel,
} from '@mui/material';
import { Add, Delete, Save } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';
import { useNavigate, useLocation } from 'react-router-dom';
import RichTextEditor from '../components/RichTextEditor';
import QuestionBankModal from '../components/QuestionBankModal';

export default function TestCreation() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [courses, setCourses] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [test, setTest] = useState({
        course_id: '', title: '', description: '', duration_minutes: 60,
        start_time: '', end_time: '', negative_marking: false,
        extra_time: [], randomize_questions: false, // Array of { email: '', minutes: 0 }
    });
    const location = useLocation();
    const [questionBankOpen, setQuestionBankOpen] = useState(false);
    const [questions, setQuestions] = useState([{
        question_text: '', question_type: 'MCQ_SINGLE', options: ['', '', '', ''],
        correct_answer: [], marks: 1, negative_marks: 0,
    }]);

    useEffect(() => {
        const loadCourses = async () => {
            let query = supabase.from('courses').select('id, name, code');
            if (user.role === 'teacher') query = query.eq('teacher_id', user.id);
            const { data } = await query;
            setCourses(data || []);
        };

        loadCourses();


        if (location.state?.duplicateData) {
            const { test: dTest, questions: dQuestions } = location.state.duplicateData;
            setTest({
                ...dTest, id: undefined, created_at: undefined, created_by: undefined,
                title: `${dTest.title} (Copy)`,
                start_time: '', end_time: '' // Reset validation
            });
            setQuestions(dQuestions.map(q => ({
                ...q, id: undefined, test_id: undefined, created_at: undefined
            })));
            setSuccess('Test duplicated. Please set new schedule.');
        }
    }, [location.state]);

    const addQuestion = () => {
        setQuestions([...questions, {
            question_text: '', question_type: 'MCQ_SINGLE', options: ['', '', '', ''],
            correct_answer: [], marks: 1, negative_marks: 0,
        }]);
    };

    const handleImportQuestions = (imported) => {
        // Keep IDs to link them!
        setQuestions([...questions, ...imported.map(q => ({
            ...q,
            test_id: undefined, // remove old test ref
            created_at: undefined
        }))]);
    };

    const addExtraTime = () => {
        setTest({ ...test, extra_time: [...test.extra_time, { email: '', minutes: 30 }] });
    };

    const updateExtraTime = (idx, field, value) => {
        const updated = [...test.extra_time];
        updated[idx] = { ...updated[idx], [field]: value };
        setTest({ ...test, extra_time: updated });
    };

    const removeExtraTime = (idx) => {
        const updated = test.extra_time.filter((_, i) => i !== idx);
        setTest({ ...test, extra_time: updated });
    };

    const removeQuestion = (idx) => {
        if (questions.length > 1) setQuestions(questions.filter((_, i) => i !== idx));
    };

    const updateQuestion = (idx, field, value) => {
        const updated = [...questions];
        // If editing a shared question, fork it (remove ID) so it saves as new
        if (updated[idx].id) {
            const { id, ...rest } = updated[idx];
            updated[idx] = { ...rest, [field]: value };
        } else {
            updated[idx] = { ...updated[idx], [field]: value };
        }
        setQuestions(updated);
    };

    const updateOption = (qIdx, oIdx, value) => {
        const updated = [...questions];
        if (updated[qIdx].id) {
            const { id, ...rest } = updated[qIdx];
            updated[qIdx] = { ...rest };
            updated[qIdx].options[oIdx] = value;
        } else {
            updated[qIdx].options[oIdx] = value;
        }
        setQuestions(updated);
    };

    const toggleCorrect = (qIdx, optionValue) => {
        const updated = [...questions];
        const q = updated[qIdx];
        if (q.question_type === 'MCQ_SINGLE') {
            q.correct_answer = [optionValue];
        } else {
            q.correct_answer = q.correct_answer.includes(optionValue)
                ? q.correct_answer.filter(a => a !== optionValue)
                : [...q.correct_answer, optionValue];
        }
        setQuestions(updated);
    };

    const handleSubmit = async () => {
        setError(''); setSuccess('');
        try {
            if (!test.title || !test.course_id || !test.start_time || !test.duration_minutes) {
                throw new Error('Fill all required fields');
            }
            const totalMarks = questions.reduce((a, q) => a + q.marks, 0);
            // Process extra time: convert to { student_id: minutes } map
            // Note: In real app, we'd need to resolve emails to IDs. For MVP, we'll store as-is or assume inputs are IDs/Usernames
            // Let's assume teacher enters Student ID or Username for now to simplify
            const extraTimeMap = {};
            test.extra_time.forEach(et => { if (et.email) extraTimeMap[et.email] = parseInt(et.minutes); });

            const startDate = new Date(test.start_time);
            const endDate = new Date(startDate.getTime() + test.duration_minutes * 60000);

            const { data: testData, error: testErr } = await supabase.from('tests').insert({
                course_id: test.course_id, title: test.title, description: test.description,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                duration_minutes: test.duration_minutes,
                total_marks: totalMarks, created_by: user.id,
                settings: {
                    negative_marking: test.negative_marking,
                    proctoring_enabled: true,
                    extra_time_students: extraTimeMap
                },
            }).select().single();
            if (testErr) throw testErr;

            // Separate new questions vs existing bank questions
            const newQuestions = questions.filter(q => !q.id);
            const existingQuestions = questions.filter(q => q.id);

            // 1. Insert New Questions
            let createdQuestionIds = [];
            if (newQuestions.length > 0) {
                const qRows = newQuestions.map(q => ({
                    question_text: q.question_text, question_type: q.question_type,
                    options: q.options, correct_answer: q.correct_answer, marks: q.marks,
                    negative_marks: q.negative_marks
                    // No test_id or order here anymore
                }));
                const { data: insertedQs, error: qErr } = await supabase
                    .from('questions').insert(qRows).select('id');
                if (qErr) throw qErr;
                createdQuestionIds = insertedQs.map(q => q.id);
            }

            // 2. Prepare Junction Table Entries
            const junctionRows = [];

            // Map new questions to their IDs (assuming order is preserved in insert return)
            // Note: Postgres insert returning order is usually reliable but not guaranteed strictly parallel
            // For safety, we should assume map parallel locally or refactor to single inserts effectively
            // BUT for this scope, let's map by index offset

            let newQIndex = 0;
            questions.forEach((q, index) => {
                let qId = q.id;
                if (!qId) {
                    qId = createdQuestionIds[newQIndex];
                    newQIndex++;
                }

                if (qId) {
                    junctionRows.push({
                        test_id: testData.id,
                        question_id: qId,
                        question_order: index + 1,
                        marks: q.marks // Snapshot marks for this test
                    });
                }
            });

            const { error: jErr } = await supabase.from('test_questions').insert(junctionRows);
            if (jErr) throw jErr;

            setSuccess('Test created successfully!');
            setTimeout(() => navigate('/dashboard/tests'), 1500);
        } catch (err) { setError(err.message); }
    };

    return (
        <Box>
            <Typography variant="h4" fontWeight={700} gutterBottom>Create Test</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            {/* Test Info */}
            <Card sx={{ mb: 3 }}><CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={600} gutterBottom>Test Information</Typography>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth select label="Course *" value={test.course_id} onChange={e => setTest({ ...test, course_id: e.target.value })}>
                            {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name} ({c.code})</MenuItem>)}
                        </TextField>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth label="Test Title *" value={test.title} onChange={e => setTest({ ...test, title: e.target.value })} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth label="Duration (min)" type="number" value={test.duration_minutes} onChange={e => setTest({ ...test, duration_minutes: parseInt(e.target.value) })} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth label="Start Time *" type="datetime-local" value={test.start_time}
                            onChange={e => setTest({ ...test, start_time: e.target.value })} InputLabelProps={{ shrink: true }} />
                    </Grid>
                    <Grid size={12}>
                        <FormControlLabel
                            control={<Switch checked={test.negative_marking} onChange={(e) => setTest({ ...test, negative_marking: e.target.checked })} />}
                            label="Enable Negative Marking"
                        />
                        <FormControlLabel
                            control={<Switch checked={test.randomize_questions || false} onChange={(e) => setTest({ ...test, randomize_questions: e.target.checked })} />}
                            label="Randomize Questions"
                        />
                    </Grid>
                    {/* Extra Time Allocation */}
                    <Grid size={12}>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="subtitle2" gutterBottom>Extra Time Allocation (Accommodation)</Typography>
                        {test.extra_time?.map((et, idx) => (
                            <Box key={idx} sx={{ display: 'flex', gap: 2, mb: 1 }}>
                                <TextField size="small" label="Student Username/Email" value={et.email}
                                    onChange={e => updateExtraTime(idx, 'email', e.target.value)} sx={{ flex: 1 }} />
                                <TextField size="small" label="Extra Minutes" type="number" value={et.minutes}
                                    onChange={e => updateExtraTime(idx, 'minutes', e.target.value)} sx={{ width: 150 }} />
                                <IconButton color="error" onClick={() => removeExtraTime(idx)}><Delete /></IconButton>
                            </Box>
                        ))}
                        <Button startIcon={<Add />} size="small" onClick={addExtraTime}>Add Student Accommodation</Button>
                    </Grid>
                </Grid>
            </CardContent></Card>

            {/* Questions */}
            {questions.map((q, qIdx) => (
                <Card key={qIdx} sx={{ mb: 2 }}><CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight={600}>Question {qIdx + 1}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <TextField select size="small" value={q.question_type}
                                onChange={e => updateQuestion(qIdx, 'question_type', e.target.value)} sx={{ minWidth: 150 }}>
                                <MenuItem value="MCQ_SINGLE">MCQ Single</MenuItem>
                                <MenuItem value="MCQ_MULTIPLE">MCQ Multiple</MenuItem>
                            </TextField>
                            <TextField size="small" label="Marks" type="number" value={q.marks} sx={{ width: 80 }}
                                onChange={e => updateQuestion(qIdx, 'marks', parseInt(e.target.value))} />
                            {test.negative_marking && <TextField size="small" label="-Marks" type="number" value={q.negative_marks}
                                sx={{ width: 80 }} onChange={e => updateQuestion(qIdx, 'negative_marks', parseInt(e.target.value))} />}
                            <IconButton color="error" onClick={() => removeQuestion(qIdx)}><Delete /></IconButton>
                        </Box>
                    </Box>
                    <RichTextEditor
                        value={q.question_text}
                        onChange={val => updateQuestion(qIdx, 'question_text', val)}
                        placeholder="Enter question text..."
                    />
                    <Box sx={{ mb: 2 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Options (click to mark as correct):
                    </Typography>
                    <Grid container spacing={1}>
                        {q.options.map((opt, oIdx) => (
                            <Grid key={oIdx} size={{ xs: 12, sm: 6 }}>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Chip label={String.fromCharCode(65 + oIdx)} size="small"
                                        color={q.correct_answer.includes(opt) && opt ? 'success' : 'default'}
                                        onClick={() => opt && toggleCorrect(qIdx, opt)} sx={{ mt: 1 }} />
                                    <TextField fullWidth size="small" placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                        value={opt} onChange={e => updateOption(qIdx, oIdx, e.target.value)} />
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </CardContent></Card>
            ))}

            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button variant="outlined" startIcon={<Add />} onClick={addQuestion}>Add Question</Button>
                <Button variant="outlined" onClick={() => setQuestionBankOpen(true)}>Import from Bank</Button>
                <Button variant="contained" startIcon={<Save />} onClick={handleSubmit} sx={{ ml: 'auto' }}>
                    Save Test ({questions.length} questions, {questions.reduce((a, q) => a + q.marks, 0)} marks)
                </Button>
            </Box>

            <QuestionBankModal
                open={questionBankOpen}
                onClose={() => setQuestionBankOpen(false)}
                onImport={handleImportQuestions}
            />
        </Box>
    );
}

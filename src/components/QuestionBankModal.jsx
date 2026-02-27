import { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, List, ListItem, ListItemText, Checkbox,
    FormControl, InputLabel, Select, MenuItem, Box, Chip,
    Typography, Pagination,
} from '@mui/material';
import { Search, Info } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

export default function QuestionBankModal({ open, onClose, onImport }) {
    const { user } = useAuthStore();
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState('all');
    const [tests, setTests] = useState([]);
    const [selectedTest, setSelectedTest] = useState('all');
    const [questions, setQuestions] = useState([]);
    const [selectedQuestions, setSelectedQuestions] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        if (open) {
            loadCourses();
            loadTests();
            loadQuestions(); // Load all initially
        }
    }, [open]);

    const loadCourses = async () => {
        const { data } = await supabase.from('courses').select('id, name');
        setCourses(data || []);
    };

    const loadTests = async () => {
        let query = supabase.from('tests').select('id, title, course_id');
        if (selectedCourse !== 'all') {
            query = query.eq('course_id', selectedCourse);
        }
        const { data } = await query;
        setTests(data || []);
    };

    const loadQuestions = async () => {
        setLoading(true);
        let query = supabase.from('questions').select('*, tests(title, course_id)');

        if (selectedTest !== 'all') {
            query = query.eq('test_id', selectedTest);
        } else if (selectedCourse !== 'all') {
            // Filter by tests in this course
            // This is harder in one query without join filtering, so we'll filter in memory or by test list
            const testIds = tests.map(t => t.id);
            if (testIds.length > 0) {
                query = query.in('test_id', testIds);
            } else {
                setQuestions([]);
                setLoading(false);
                return;
            }
        }

        if (searchTerm) {
            query = query.ilike('question_text', `%${searchTerm}%`);
        }

        const { data } = await query;
        setQuestions(data || []);
        setLoading(false);
    };

    useEffect(() => {
        if (open) loadTests();
    }, [selectedCourse]);

    useEffect(() => {
        if (open) loadQuestions();
    }, [selectedTest, searchTerm]); // Trigger search on these changes

    const handleToggle = (q) => {
        const currentIndex = selectedQuestions.findIndex(sq => sq.id === q.id);
        const newChecked = [...selectedQuestions];

        if (currentIndex === -1) {
            newChecked.push(q);
        } else {
            newChecked.splice(currentIndex, 1);
        }

        setSelectedQuestions(newChecked);
    };

    const handleImport = () => {
        // Strip IDs to create new question copies
        const questionsToImport = selectedQuestions.map(({ id, test_id, created_at, ...rest }) => rest);
        onImport(questionsToImport);
        onClose();
        setSelectedQuestions([]);
    };

    // Pagination logic
    const paginatedQuestions = questions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(questions.length / ITEMS_PER_PAGE);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Question Bank</DialogTitle>
            <DialogContent dividers>
                <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Course</InputLabel>
                        <Select value={selectedCourse} label="Course" onChange={e => { setSelectedCourse(e.target.value); setSelectedTest('all'); }}>
                            <MenuItem value="all">All Courses</MenuItem>
                            {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Test Source</InputLabel>
                        <Select value={selectedTest} label="Test Source" onChange={e => setSelectedTest(e.target.value)}>
                            <MenuItem value="all">All Tests</MenuItem>
                            {tests.map(t => <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>)}
                        </Select>
                    </FormControl>

                    <TextField
                        size="small"
                        placeholder="Search questions..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        InputProps={{ startAdornment: <Search color="action" sx={{ mr: 1 }} /> }}
                        sx={{ flex: 1 }}
                    />
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    {selectedQuestions.length} selected
                </Typography>

                <List>
                    {paginatedQuestions.map(q => {
                        const isSelected = selectedQuestions.some(sq => sq.id === q.id);
                        return (
                            <ListItem
                                key={q.id}
                                button
                                onClick={() => handleToggle(q)}
                                sx={{
                                    border: '1px solid',
                                    borderColor: isSelected ? 'primary.main' : 'divider',
                                    borderRadius: 1,
                                    mb: 1,
                                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                                }}
                            >
                                <Checkbox checked={isSelected} tabIndex={-1} disableRipple />
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, maxHeight: 60, overflow: 'hidden' }}>
                                                {q.question_text.substring(0, 100)}{q.question_text.length > 100 ? '...' : ''}
                                            </Typography>
                                            <Chip label={`${q.marks} marks`} size="small" variant="outlined" />
                                        </Box>
                                    }
                                    secondary={
                                        <Typography variant="caption" color="text.secondary">
                                            {q.question_type} • From: {q.tests?.title}
                                        </Typography>
                                    }
                                />
                            </ListItem>
                        );
                    })}
                    {questions.length === 0 && (
                        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                            <Info sx={{ mb: 1 }} />
                            <Typography>No questions found matching your filters.</Typography>
                        </Box>
                    )}
                </List>

                {totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                        <Pagination count={totalPages} page={page} onChange={(e, p) => setPage(p)} color="primary" />
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleImport} disabled={selectedQuestions.length === 0}>
                    Import {selectedQuestions.length} Questions
                </Button>
            </DialogActions>
        </Dialog>
    );
}

import { useState, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, MenuItem, Box, Typography,
    CircularProgress, Alert, Switch, FormControlLabel,
    Checkbox, List, ListItem, ListItemText, ListItemIcon,
    Divider, ToggleButtonGroup, ToggleButton, Chip
} from '@mui/material';
import { AutoAwesome, UploadFile, Description, CheckCircle, Warning } from '@mui/icons-material';
import * as pdfjsLib from 'pdfjs-dist';
// Explicitly import the worker for Vite/Webpack environments
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Initialize PDF.js worker using the local bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const apiKey = import.meta.env.VITE_GROQ_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODELS = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-3.0-flash', name: 'Gemini 3 Flash', provider: 'gemini' },
    { id: 'openai/gpt-oss-120b', name: 'Groq: GPT-OSS 120B', provider: 'groq' },
    { id: 'qwen/qwen3-32b', name: 'Groq: Qwen 3 32B', provider: 'groq' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Groq: Llama 4 Scout', provider: 'groq' },
    { id: 'llama-3.3-70b-versatile', name: 'Groq: Llama 3.3 70B', provider: 'groq' },
    { id: 'llama-3.1-8b-instant', name: 'Groq: Llama 3.1 8B', provider: 'groq' }
];

export default function AIGeneratorModal({ open, onClose, onGenerate }) {
    const [step, setStep] = useState(1); // 1 = Input, 2 = Generating, 3 = Preview

    // Input State
    const [sourceType, setSourceType] = useState('text'); // 'text' or 'pdf'
    const [textInput, setTextInput] = useState('');
    const [pdfFile, setPdfFile] = useState(null);
    const [numQuestions, setNumQuestions] = useState(5);
    const [difficulty, setDifficulty] = useState('Medium');
    const [questionType, setQuestionType] = useState('MCQ_SINGLE'); // MCQ_SINGLE or MCQ_MULTIPLE
    const [selectedModel, setSelectedModel] = useState(MODELS[0].id);

    // Processing State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Preview State
    const [generatedQuestions, setGeneratedQuestions] = useState([]);
    const [selectedQIndices, setSelectedQIndices] = useState([]);

    const fileInputRef = useRef(null);

    const extractTextFromPDF = async (file) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }
            return fullText;
        } catch (err) {
            console.error("PDF Parsing Error: ", err);
            throw new Error(`Failed to read PDF: ${err.message || "File might be corrupted, encrypted, or not text-based."}`);
        }
    };

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });

    const handleGenerate = async () => {
        setError('');
        setLoading(true);
        setStep(2);

        try {
            const modelConfig = MODELS.find(m => m.id === selectedModel);

            // 1. Get Source Text or PDF Data
            let sourceText = textInput;
            let pdfBase64 = null;

            if (sourceType === 'pdf') {
                if (!pdfFile) throw new Error("Please upload a PDF file first.");
                if (pdfFile.size > 20 * 1024 * 1024) throw new Error("PDF exceeds the 20MB limit for AI processing.");

                if (modelConfig.provider === 'gemini' && pdfFile.size <= 3 * 1024 * 1024) {
                    // Gemini handles raw PDF base64 directly, but ONLY for small files on the free tier to avoid 429 Payload/Rate Limits.
                    pdfBase64 = await fileToBase64(pdfFile);
                    sourceText = "Please refer to the attached PDF document to generate the questions.";
                } else {
                    // For Groq, OR for massive >3MB PDFs on Gemini, we MUST use local text extraction
                    // because sending a 12MB textbook directly as base64 in a single prompt hits immediately 429s.
                    sourceText = await extractTextFromPDF(pdfFile);
                    if (!sourceText.trim()) throw new Error("Could not extract text from this PDF locally. Please ensure it's a text-based PDF.");

                    // Strictly truncate massive textbooks so we don't blow up the token limit
                    if (sourceText.length > 30000) {
                        sourceText = sourceText.substring(0, 30000) + "... [truncated]";
                    }
                }
            } else {
                if (!sourceText.trim()) throw new Error("Please provide some source text.");
                // Truncate text input too just in case
                if (sourceText.length > 30000) sourceText = sourceText.substring(0, 30000) + "... [truncated]";
            }

            // 2. Build Prompt
            const prompt = `You are an expert test creator. Based ONLY on the following source text, generate EXACTLY ${numQuestions} multiple-choice questions. 
Difficulty Level: ${difficulty}
Question Type: ${questionType === 'MCQ_SINGLE' ? 'Single Correct Answer' : 'Multiple Correct Answers'}.

CRITICAL: You MUST output the response in PURE JSON format. Do not include markdown blocks like \`\`\`json. 
The JSON must be an array of objects. Each object must have these exactly 3 keys:
- "question_text": The question string.
- "options": An array of exactly 4 strings representing the choices.
- "correct_answer": An array of strings containing the exact correct option(s) from the options list. If the type is Single Correct Answer, this array must contain exactly 1 item. If Multiple Correct, it can contain 1 to 4 items.

SOURCE TEXT:
${sourceText}`;

            let resultJsonString = '';

            // 3. Call API
            if (modelConfig.provider === 'gemini') {
                const parts = [{ text: prompt }];
                if (pdfBase64) {
                    parts.push({
                        inlineData: {
                            mimeType: "application/pdf",
                            data: pdfBase64
                        }
                    });
                }

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelConfig.id}:generateContent?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });

                if (res.status === 429) throw new Error("Gemini Rate Limit Exceeded (429). The free tier of Gemini limits the size and frequency of requests. Try uploading a smaller text selection instead of a massive PDF, or wait a minute before trying again.");
                if (!res.ok) throw new Error(`Gemini API Error: ${res.statusText}`);

                const data = await res.json();
                resultJsonString = data.candidates[0].content.parts[0].text;
            }
            else if (modelConfig.provider === 'groq') {
                const res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${GROQ_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: modelConfig.id,
                        temperature: 0.3,
                        messages: [
                            { role: "system", content: "You are an API that strictly outputs pure JSON. You output pure JSON objects containing a 'questions' array. Never use markdown formatting." },
                            { role: "user", content: prompt + "\n\nWrap the final array in a JSON object with the key 'questions', like {\"questions\": [ ... ]}" }
                        ]
                    })
                });

                if (res.status === 429) throw new Error("Groq Rate Limit Exceeded (429). The free tier allows limited requests per minute. Please wait a few seconds and try again.");
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    console.error("Groq Raw Error:", errorData);
                    throw new Error(`Groq API Error: ${errorData.error?.message || res.statusText}`);
                }

                const data = await res.json();
                const contentStr = data.choices[0].message.content;
                const parsedWrapped = JSON.parse(contentStr);
                resultJsonString = JSON.stringify(parsedWrapped.questions || parsedWrapped); // Extract array
            }

            // 4. Parse JSON
            let parsedQuestions = [];
            try {
                // Remove markdown formatting if any was accidentally included
                let cleanJson = resultJsonString.replace(/```json/g, '').replace(/```/g, '').trim();
                parsedQuestions = JSON.parse(cleanJson);

                // Validate format
                if (!Array.isArray(parsedQuestions)) throw new Error("Result is not an array");
                parsedQuestions = parsedQuestions.map(q => ({
                    question_text: q.question_text || 'Error Parsing Question',
                    options: Array.isArray(q.options) ? q.options : [],
                    correct_answer: Array.isArray(q.correct_answer) ? q.correct_answer : [q.correct_answer].filter(Boolean),
                    question_type: questionType,
                    marks: 1,
                    negative_marks: 0
                }));

            } catch (parseErr) {
                console.error("AI JSON Parse Error:", resultJsonString, parseErr);
                throw new Error("Failed to parse the AI's response into questions. Please try again.");
            }

            setGeneratedQuestions(parsedQuestions);
            setSelectedQIndices(parsedQuestions.map((_, i) => i)); // Select all by default
            setStep(3); // Go to Preview

        } catch (err) {
            setError(err.message);
            setStep(1); // Go back to input
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.type !== 'application/pdf') {
                setError('Please upload a valid PDF file.');
                return;
            }
            setPdfFile(file);
            setError('');
        }
    };

    const handleToggleQuestion = (index) => {
        if (selectedQIndices.includes(index)) {
            setSelectedQIndices(selectedQIndices.filter(i => i !== index));
        } else {
            setSelectedQIndices([...selectedQIndices, index]);
        }
    };

    const handleAddSelected = () => {
        const finalQuestions = selectedQIndices.map(i => generatedQuestions[i]);
        onGenerate(finalQuestions);
        onClose();
        // Reset state after close
        setTimeout(() => {
            setStep(1); setGeneratedQuestions([]); setTextInput(''); setPdfFile(null);
        }, 300);
    };

    return (
        <Dialog open={open} onClose={loading ? null : onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AutoAwesome color="primary" />
                {step === 1 && "Generate Questions with AI"}
                {step === 2 && "AI is working..."}
                {step === 3 && "Review Generated Questions"}
            </DialogTitle>

            <DialogContent dividers>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* STEP 1: CONFIGURATION */}
                {step === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
                        {/* Source Toggle */}
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>Input Source</Typography>
                            <ToggleButtonGroup
                                value={sourceType}
                                exclusive
                                onChange={(e, val) => {
                                    if (val) {
                                        setSourceType(val);
                                        // Auto-switch to Gemini if user switches to PDF while Groq is selected
                                        if (val === 'pdf') {
                                            const currentModel = MODELS.find(m => m.id === selectedModel);
                                            if (currentModel && currentModel.provider === 'groq') {
                                                setSelectedModel('gemini-2.5-flash');
                                            }
                                        }
                                    }
                                }}
                                size="small"
                                sx={{ mb: 2 }}
                            >
                                <ToggleButton value="text"><Description sx={{ mr: 1, fontSize: 18 }} /> Paste Text</ToggleButton>
                                <ToggleButton value="pdf"><UploadFile sx={{ mr: 1, fontSize: 18 }} /> Upload PDF</ToggleButton>
                            </ToggleButtonGroup>

                            {sourceType === 'text' ? (
                                <TextField
                                    fullWidth multiline rows={6}
                                    placeholder="Paste reading material, syllabus topics, or notes here..."
                                    value={textInput}
                                    onChange={e => setTextInput(e.target.value)}
                                />
                            ) : (
                                <Box sx={{ p: 3, border: '2px dashed #ccc', borderRadius: 2, textAlign: 'center' }}>
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        style={{ display: 'none' }}
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                    />
                                    <Button variant="outlined" startIcon={<UploadFile />} onClick={() => fileInputRef.current.click()}>
                                        Select PDF
                                    </Button>
                                    {pdfFile && <Typography variant="body2" sx={{ mt: 1, color: 'success.main' }}>
                                        <CheckCircle fontSize="inherit" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                                        {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                                    </Typography>}
                                </Box>
                            )}
                        </Box>

                        <Divider />

                        {/* Settings */}
                        <Typography variant="subtitle2" gutterBottom>Generation Settings</Typography>
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <TextField
                                select label="Number of Questions" size="small"
                                value={numQuestions} onChange={e => setNumQuestions(e.target.value)}
                                sx={{ minWidth: 150 }}
                            >
                                {[3, 5, 10, 15, 20].map(n => <MenuItem key={n} value={n}>{n} Questions</MenuItem>)}
                            </TextField>

                            <TextField
                                select label="Difficulty" size="small"
                                value={difficulty} onChange={e => setDifficulty(e.target.value)}
                                sx={{ minWidth: 150 }}
                            >
                                {['Easy', 'Medium', 'Hard', 'Expert'].map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                            </TextField>

                            <TextField
                                select label="Question Type" size="small"
                                value={questionType} onChange={e => setQuestionType(e.target.value)}
                                sx={{ minWidth: 200 }}
                            >
                                <MenuItem value="MCQ_SINGLE">Single Correct Answer</MenuItem>
                                <MenuItem value="MCQ_MULTIPLE">Multiple Correct Answers</MenuItem>
                            </TextField>

                            <TextField
                                select label="AI Model" size="small"
                                value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                                sx={{ minWidth: 200 }}
                            >
                                {MODELS.map(m => (
                                    <MenuItem
                                        key={m.id}
                                        value={m.id}
                                        disabled={sourceType === 'pdf' && m.provider === 'groq'}
                                    >
                                        {m.name} {sourceType === 'pdf' && m.provider === 'groq' && '(Text Only)'}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Box>

                        <Alert severity="info" sx={{ mt: 1 }}>
                            The AI will strictly extract information from the provided text or PDF. Ensure your source material contains enough detail for {numQuestions} questions.
                        </Alert>
                    </Box>
                )}

                {/* STEP 2: LOADING */}
                {step === 2 && (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <CircularProgress sx={{ mb: 2 }} />
                        <Typography variant="h6">Analyzing Source Material...</Typography>
                        <Typography color="text.secondary">Generating {numQuestions} {difficulty} questions using {selectedModel}</Typography>
                    </Box>
                )}

                {/* STEP 3: PREVIEW */}
                {step === 3 && (
                    <Box>
                        <Alert severity="success" sx={{ mb: 2 }}>
                            Generated {generatedQuestions.length} questions successfully! Select the ones you want to add to your test.
                        </Alert>
                        <List sx={{ width: '100%', bgcolor: 'background.paper', border: '1px solid #eee', borderRadius: 2 }}>
                            {generatedQuestions.map((q, idx) => {
                                const isSelected = selectedQIndices.includes(idx);
                                return (
                                    <ListItem
                                        key={idx}
                                        divider={idx !== generatedQuestions.length - 1}
                                        sx={{
                                            alignItems: 'flex-start', py: 2, cursor: 'pointer',
                                            bgcolor: isSelected ? 'rgba(78, 205, 196, 0.05)' : 'transparent',
                                            borderLeft: isSelected ? '4px solid #4ECDC4' : '4px solid transparent',
                                            transition: 'all 0.2s'
                                        }}
                                        onClick={() => handleToggleQuestion(idx)}
                                    >
                                        <ListItemIcon sx={{ mt: 0 }}>
                                            <Checkbox
                                                edge="start"
                                                checked={isSelected}
                                                tabIndex={-1}
                                                disableRipple
                                            />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={
                                                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                                                    {q.question_text}
                                                </Typography>
                                            }
                                            secondary={
                                                <Box component="div">
                                                    <Box component="ul" sx={{ pl: 2, m: 0 }}>
                                                        {q.options.map((opt, oIdx) => {
                                                            const isCorrect = q.correct_answer.includes(opt);
                                                            return (
                                                                <Typography component="li" key={oIdx} variant="body2"
                                                                    sx={{ color: isCorrect ? 'success.main' : 'text.secondary', fontWeight: isCorrect ? 600 : 400, mb: 0.5 }}>
                                                                    {opt} {isCorrect && <CheckCircle sx={{ fontSize: 12, ml: 0.5, verticalAlign: 'middle' }} />}
                                                                </Typography>
                                                            );
                                                        })}
                                                    </Box>
                                                </Box>
                                            }
                                        />
                                    </ListItem>
                                )
                            })}
                        </List>
                        {generatedQuestions.length === 0 && (
                            <Typography color="error" sx={{ py: 4, textAlign: 'center' }}>
                                Failed to parse any questions from the AI output.
                            </Typography>
                        )}
                    </Box>
                )}

            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                {step === 1 && (
                    <>
                        <Button color="inherit" onClick={onClose}>Cancel</Button>
                        <Button variant="contained" onClick={handleGenerate} startIcon={<AutoAwesome />} disabled={loading}>
                            Generate
                        </Button>
                    </>
                )}
                {step === 2 && (
                    <Button color="inherit" disabled>Please wait...</Button>
                )}
                {step === 3 && (
                    <>
                        <Button color="inherit" onClick={() => setStep(1)}>Generate Again</Button>
                        <Button color="inherit" onClick={onClose}>Discard</Button>
                        <Button
                            variant="contained"
                            onClick={handleAddSelected}
                            disabled={selectedQIndices.length === 0}
                        >
                            Add Selected ({selectedQIndices.length}) to Test
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}


import { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Box, Typography, MenuItem, Select, FormControl, InputLabel,
    Alert, CircularProgress, Chip, Divider, IconButton, Tooltip,
} from '@mui/material';
import {
    Key, ContentCopy, Refresh, CheckCircle, Timer, Lock,
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

// ─── Helpers ────────────────────────────────────────────────────────────────
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // removed I, O, 0, 1 (visually confusing)
const CODE_TTL_SECONDS = 300; // 5 minutes

function generateCode() {
    let code = '';
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    arr.forEach(byte => { code += CHARSET[byte % CHARSET.length]; });
    return code;
}

function formatCountdown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function OverrideCodeGenerator({ open, onClose }) {
    const { user } = useAuthStore();
    const [purpose, setPurpose] = useState('module_override');
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [generatedCode, setGeneratedCode] = useState(null);   // { code, expiresAt }
    const [timeLeft, setTimeLeft] = useState(0);
    const [copied, setCopied] = useState(false);
    const timerRef = useRef(null);

    // Countdown ticker
    useEffect(() => {
        if (!generatedCode) return;
        setTimeLeft(CODE_TTL_SECONDS);

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [generatedCode]);

    const handleGenerate = async () => {
        setGenerating(true);
        setError('');
        try {
            const code = generateCode();
            const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

            const { error: dbErr } = await supabase.from('override_codes').insert({
                code,
                purpose,
                created_by: user.id,
                expires_at: expiresAt,
            });

            if (dbErr) throw dbErr;

            setGeneratedCode({ code, expiresAt });
        } catch (err) {
            setError(err.message || 'Failed to generate code');
        }
        setGenerating(false);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedCode?.code || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReset = () => {
        setGeneratedCode(null);
        setTimeLeft(0);
        clearInterval(timerRef.current);
        setError('');
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    const isExpired = timeLeft === 0 && generatedCode;
    const urgentColor = timeLeft < 60 ? '#FF4D6A' : timeLeft < 120 ? '#FFB74D' : '#4ECDC4';

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                bgcolor: 'rgba(108,99,255,0.08)',
                borderBottom: '1px solid rgba(108,99,255,0.15)',
            }}>
                <Key sx={{ color: '#6C63FF' }} />
                <Box>
                    <Typography fontWeight={700} variant="subtitle1">Generate Override Code</Typography>
                    <Typography variant="caption" color="text.secondary">
                        Single-use · 5-minute expiry · Anyone with the code can redeem
                    </Typography>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ pt: 2.5 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

                {!generatedCode ? (
                    /* ── Step 1: Choose purpose ── */
                    <Box>
                        <FormControl fullWidth sx={{ mt: 1 }}>
                            <InputLabel>Purpose</InputLabel>
                            <Select
                                value={purpose}
                                label="Purpose"
                                onChange={e => setPurpose(e.target.value)}
                            >
                                <MenuItem value="module_override">
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>Module Override</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Lets student disable specific proctoring modules
                                        </Typography>
                                    </Box>
                                </MenuItem>
                                <MenuItem value="face_reset">
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>Face ID Reset</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Clears the student's face registration for re-enrollment
                                        </Typography>
                                    </Box>
                                </MenuItem>
                            </Select>
                        </FormControl>

                        <Alert severity="info" sx={{ mt: 2 }} icon={<Lock fontSize="small" />}>
                            The generated code will be valid for <strong>5 minutes</strong> and can only be used <strong>once</strong>.
                            Share it directly with the student.
                        </Alert>
                    </Box>
                ) : (
                    /* ── Step 2: Show generated code ── */
                    <Box sx={{ textAlign: 'center', py: 1 }}>
                        <Chip
                            label={purpose === 'module_override' ? 'Module Override' : 'Face ID Reset'}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ mb: 2 }}
                        />

                        {/* The code display */}
                        <Box sx={{
                            p: 3, borderRadius: 3, mb: 2,
                            bgcolor: isExpired ? 'rgba(255,77,106,0.06)' : 'rgba(108,99,255,0.06)',
                            border: `2px solid ${isExpired ? 'rgba(255,77,106,0.3)' : 'rgba(108,99,255,0.2)'}`,
                            position: 'relative',
                        }}>
                            <Typography
                                variant="h3"
                                fontFamily="monospace"
                                fontWeight={800}
                                letterSpacing={8}
                                sx={{
                                    color: isExpired ? 'text.disabled' : '#6C63FF',
                                    textDecoration: isExpired ? 'line-through' : 'none',
                                    userSelect: 'text',
                                }}
                            >
                                {generatedCode.code}
                            </Typography>

                            {!isExpired && (
                                <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
                                    <IconButton
                                        size="small"
                                        onClick={handleCopy}
                                        sx={{
                                            position: 'absolute', top: 8, right: 8,
                                            color: copied ? '#4ECDC4' : 'text.secondary',
                                        }}
                                    >
                                        {copied ? <CheckCircle fontSize="small" /> : <ContentCopy fontSize="small" />}
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Box>

                        {/* Countdown */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
                            <Timer sx={{ fontSize: 18, color: isExpired ? '#FF4D6A' : urgentColor }} />
                            {isExpired ? (
                                <Typography color="error" fontWeight={600}>Code Expired</Typography>
                            ) : (
                                <Typography fontWeight={700} sx={{ color: urgentColor, fontFamily: 'monospace', fontSize: '1.1rem' }}>
                                    {formatCountdown(timeLeft)} remaining
                                </Typography>
                            )}
                        </Box>

                        <Divider sx={{ my: 1.5 }} />

                        <Button
                            size="small"
                            startIcon={<Refresh />}
                            onClick={handleReset}
                            sx={{ mt: 1 }}
                        >
                            Generate New Code
                        </Button>
                    </Box>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={handleClose}>
                    {generatedCode ? 'Done' : 'Cancel'}
                </Button>
                {!generatedCode && (
                    <Button
                        variant="contained"
                        onClick={handleGenerate}
                        disabled={generating}
                        startIcon={generating ? <CircularProgress size={16} /> : <Key />}
                        sx={{ bgcolor: '#6C63FF', '&:hover': { bgcolor: '#5a52e0' } }}
                    >
                        Generate Code
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

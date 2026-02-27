import { useState, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, IconButton, Box, Button, Typography,
} from '@mui/material';
import { Close, Backspace } from '@mui/icons-material';

/**
 * ExamCalculator — Simple in-app calculator for exam use.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 */
export default function ExamCalculator({ open, onClose }) {
    const [display, setDisplay] = useState('0');
    const [expression, setExpression] = useState('');
    const [hasResult, setHasResult] = useState(false);

    const handleNumber = useCallback((num) => {
        if (hasResult) {
            setDisplay(num);
            setExpression('');
            setHasResult(false);
        } else {
            setDisplay(prev => prev === '0' ? num : prev + num);
        }
    }, [hasResult]);

    const handleOperator = useCallback((op) => {
        setExpression(display + ' ' + op + ' ');
        setDisplay('0');
        setHasResult(false);
    }, [display]);

    const handleEquals = useCallback(() => {
        try {
            const fullExpr = expression + display;
            // Replace display operators with JS operators
            const sanitized = fullExpr
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/[^0-9+\-*/().% ]/g, '');

            if (!sanitized.trim()) return;

            // eslint-disable-next-line no-eval
            const result = Function('"use strict"; return (' + sanitized + ')')();
            const formatted = Number.isFinite(result)
                ? parseFloat(result.toFixed(10)).toString()
                : 'Error';

            setDisplay(formatted);
            setExpression(fullExpr + ' =');
            setHasResult(true);
        } catch {
            setDisplay('Error');
            setHasResult(true);
        }
    }, [expression, display]);

    const handleClear = useCallback(() => {
        setDisplay('0');
        setExpression('');
        setHasResult(false);
    }, []);

    const handleBackspace = useCallback(() => {
        if (hasResult) return;
        setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    }, [hasResult]);

    const handlePercent = useCallback(() => {
        try {
            const val = parseFloat(display);
            if (!isNaN(val)) {
                setDisplay((val / 100).toString());
            }
        } catch {
            // ignore
        }
    }, [display]);

    const handleDot = useCallback(() => {
        if (hasResult) {
            setDisplay('0.');
            setExpression('');
            setHasResult(false);
        } else if (!display.includes('.')) {
            setDisplay(prev => prev + '.');
        }
    }, [display, hasResult]);

    const buttons = [
        ['C', '%', '⌫', '÷'],
        ['7', '8', '9', '×'],
        ['4', '5', '6', '-'],
        ['1', '2', '3', '+'],
        ['00', '0', '.', '='],
    ];

    const getButtonAction = (btn) => {
        switch (btn) {
            case 'C': return handleClear;
            case '⌫': return handleBackspace;
            case '%': return handlePercent;
            case '.': return handleDot;
            case '=': return handleEquals;
            case '+': case '-': case '×': case '÷': return () => handleOperator(btn);
            default: return () => handleNumber(btn);
        }
    };

    const getButtonStyle = (btn) => {
        if (btn === '=') return {
            bgcolor: '#6C63FF',
            color: '#fff',
            '&:hover': { bgcolor: '#5A52E0' },
        };
        if (['+', '-', '×', '÷'].includes(btn)) return {
            bgcolor: 'rgba(108,99,255,0.12)',
            color: '#6C63FF',
            fontWeight: 700,
            '&:hover': { bgcolor: 'rgba(108,99,255,0.2)' },
        };
        if (['C', '%', '⌫'].includes(btn)) return {
            bgcolor: 'rgba(255,77,106,0.1)',
            color: '#FF4D6A',
            '&:hover': { bgcolor: 'rgba(255,77,106,0.18)' },
        };
        return {
            bgcolor: 'rgba(148,163,184,0.08)',
            '&:hover': { bgcolor: 'rgba(148,163,184,0.15)' },
        };
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    width: 320,
                    maxWidth: '90vw',
                    overflow: 'hidden',
                    bgcolor: 'background.paper',
                },
            }}
        >
            <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                py: 1.5,
                px: 2,
                bgcolor: 'rgba(108,99,255,0.06)',
            }}>
                <Typography variant="subtitle2" fontWeight={700}>Calculator</Typography>
                <IconButton size="small" onClick={onClose}>
                    <Close sx={{ fontSize: 18 }} />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 2, pt: '12px !important' }}>
                {/* Display */}
                <Box sx={{
                    bgcolor: 'rgba(0,0,0,0.15)',
                    borderRadius: 2,
                    p: 2,
                    mb: 2,
                    textAlign: 'right',
                    minHeight: 70,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                }}>
                    {expression && (
                        <Typography variant="caption" color="text.secondary" sx={{
                            fontSize: 12,
                            mb: 0.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {expression}
                        </Typography>
                    )}
                    <Typography variant="h4" fontWeight={700} sx={{
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: display.length > 12 ? '1.2rem' : display.length > 8 ? '1.6rem' : '2rem',
                    }}>
                        {display}
                    </Typography>
                </Box>

                {/* Button Grid */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                    {buttons.map((row, ri) => (
                        <Box key={ri} sx={{ display: 'flex', gap: 0.8 }}>
                            {row.map((btn) => (
                                <Button
                                    key={btn}
                                    onClick={getButtonAction(btn)}
                                    variant="text"
                                    sx={{
                                        flex: 1,
                                        minWidth: 0,
                                        height: 48,
                                        borderRadius: 2,
                                        fontSize: btn === '⌫' ? 16 : 18,
                                        fontWeight: 600,
                                        fontFamily: 'monospace',
                                        textTransform: 'none',
                                        ...getButtonStyle(btn),
                                    }}
                                >
                                    {btn === '⌫' ? <Backspace sx={{ fontSize: 18 }} /> : btn}
                                </Button>
                            ))}
                        </Box>
                    ))}
                </Box>
            </DialogContent>
        </Dialog>
    );
}

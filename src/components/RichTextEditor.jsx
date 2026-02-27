import { useState, useRef } from 'react';
import { Box, IconButton, TextField, Tooltip } from '@mui/material';
import {
    FormatBold, FormatItalic, FormatListBulleted, FormatListNumbered,
    Code, Image, Link as LinkIcon,
} from '@mui/icons-material';

export default function RichTextEditor({ value, onChange, label, placeholder }) {
    const inputRef = useRef(null);

    const insertFormat = (startTag, endTag) => {
        const input = inputRef.current;
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = value || '';
        const before = text.substring(0, start);
        const selection = text.substring(start, end);
        const after = text.substring(end);

        const newValue = `${before}${startTag}${selection}${endTag}${after}`;
        onChange(newValue);

        // restore cursor/selection
        setTimeout(() => {
            input.focus();
            input.setSelectionRange(start + startTag.length, end + startTag.length);
        }, 0);
    };

    return (
        <Box sx={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: 1 }}>
            <Box sx={{
                display: 'flex', gap: 0.5, p: 0.5, borderBottom: '1px solid rgba(148,163,184,0.1)',
                bgcolor: 'rgba(148,163,184,0.02)'
            }}>
                <Tooltip title="Bold">
                    <IconButton size="small" onClick={() => insertFormat('**', '**')}><FormatBold fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Italic">
                    <IconButton size="small" onClick={() => insertFormat('*', '*')}><FormatItalic fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Bullet List">
                    <IconButton size="small" onClick={() => insertFormat('\n- ', '')}><FormatListBulleted fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Numbered List">
                    <IconButton size="small" onClick={() => insertFormat('\n1. ', '')}><FormatListNumbered fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Code Block">
                    <IconButton size="small" onClick={() => insertFormat('`', '`')}><Code fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Image">
                    <IconButton size="small" onClick={() => insertFormat('![alt](', ')')}><Image fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Link">
                    <IconButton size="small" onClick={() => insertFormat('[text](', ')')}><LinkIcon fontSize="small" /></IconButton>
                </Tooltip>
            </Box>
            <TextField
                fullWidth
                multiline
                minRows={3}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                inputRef={inputRef}
                placeholder={placeholder}
                variant="standard"
                InputProps={{ disableUnderline: true, sx: { p: 2 } }}
            />
        </Box>
    );
}

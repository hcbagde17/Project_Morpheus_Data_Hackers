import { useState, useRef, useCallback } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { DragIndicator, Remove, Add } from '@mui/icons-material';

/**
 * FloatingPanel — Draggable, minimizable wrapper for monitor panels.
 *
 * Props:
 *   title: string — header label
 *   defaultPosition: { x, y } — initial pixel offset from top-left
 *   children: ReactNode — the monitor content
 *   width: number — panel width (default 280)
 */
export default function FloatingPanel({ title, defaultPosition = { x: 100, y: 100 }, children, width = 280 }) {
    const [position, setPosition] = useState(defaultPosition);
    const [minimized, setMinimized] = useState(false);
    const dragRef = useRef(null);
    const offsetRef = useRef({ x: 0, y: 0 });

    const handleMouseDown = useCallback((e) => {
        // Only drag from the header area
        e.preventDefault();
        offsetRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        };

        const handleMouseMove = (moveEvent) => {
            const newX = Math.max(0, Math.min(window.innerWidth - width, moveEvent.clientX - offsetRef.current.x));
            const newY = Math.max(0, Math.min(window.innerHeight - 40, moveEvent.clientY - offsetRef.current.y));
            setPosition({ x: newX, y: newY });
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [position, width]);

    return (
        <Box
            ref={dragRef}
            sx={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                width,
                zIndex: 9999,
                bgcolor: 'background.paper',
                borderRadius: 2,
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                transition: 'box-shadow 0.2s ease',
                '&:hover': { boxShadow: '0 12px 40px rgba(0,0,0,0.4)' },
            }}
        >
            {/* Drag Handle Header */}
            <Box
                onMouseDown={handleMouseDown}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1.5,
                    py: 0.5,
                    cursor: 'grab',
                    bgcolor: 'rgba(108,99,255,0.08)',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    userSelect: 'none',
                    '&:active': { cursor: 'grabbing' },
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DragIndicator sx={{ fontSize: 16, color: 'text.secondary', opacity: 0.6 }} />
                    <Typography variant="caption" fontWeight={600} sx={{ fontSize: 11 }}>
                        {title}
                    </Typography>
                </Box>
                <IconButton
                    size="small"
                    onClick={() => setMinimized(!minimized)}
                    sx={{ p: 0.3 }}
                >
                    {minimized ? <Add sx={{ fontSize: 14 }} /> : <Remove sx={{ fontSize: 14 }} />}
                </IconButton>
            </Box>

            {/* Content — collapsible */}
            {!minimized && (
                <Box sx={{ p: 0 }}>
                    {children}
                </Box>
            )}
        </Box>
    );
}

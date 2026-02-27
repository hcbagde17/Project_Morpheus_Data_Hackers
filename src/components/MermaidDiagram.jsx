import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Box, Typography } from '@mui/material';

mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
});

let idCounter = 0;

export default function MermaidDiagram({ chart }) {
    const containerRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!containerRef.current || !chart) return;

        const id = `mermaid-${idCounter++}`;
        setError(null);

        mermaid.render(id, chart.trim())
            .then(({ svg }) => {
                if (containerRef.current) {
                    containerRef.current.innerHTML = svg;
                }
            })
            .catch((err) => {
                console.error('Mermaid render error:', err);
                setError(err.message || 'Failed to render diagram');
            });
    }, [chart]);

    if (error) {
        return (
            <Box sx={{ p: 2, border: '1px solid rgba(255,100,100,0.3)', borderRadius: 2 }}>
                <Typography color="error" variant="body2">Diagram Error: {error}</Typography>
            </Box>
        );
    }

    return <div ref={containerRef} />;
}

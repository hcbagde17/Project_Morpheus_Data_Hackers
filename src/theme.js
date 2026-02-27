import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#6C63FF',
            light: '#8B85FF',
            dark: '#4B44CC',
            contrastText: '#fff',
        },
        secondary: {
            main: '#00D9FF',
            light: '#33E1FF',
            dark: '#00AABB',
        },
        error: {
            main: '#FF4D6A',
            light: '#FF7A8F',
            dark: '#CC3D55',
        },
        warning: {
            main: '#FFB74D',
            light: '#FFCA80',
            dark: '#CC923E',
        },
        success: {
            main: '#4ECDC4',
            light: '#7EDBD5',
            dark: '#3EA49D',
        },
        background: {
            default: '#0A0E1A',
            paper: '#111827',
        },
        text: {
            primary: '#F1F5F9',
            secondary: '#94A3B8',
        },
        divider: 'rgba(148, 163, 184, 0.12)',
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        h1: { fontWeight: 700, letterSpacing: '-0.02em' },
        h2: { fontWeight: 700, letterSpacing: '-0.01em' },
        h3: { fontWeight: 600 },
        h4: { fontWeight: 600 },
        h5: { fontWeight: 600 },
        h6: { fontWeight: 600 },
        button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: {
        borderRadius: 12,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 10,
                    padding: '10px 24px',
                    fontSize: '0.9rem',
                },
                contained: {
                    boxShadow: '0 4px 14px rgba(108, 99, 255, 0.35)',
                    '&:hover': {
                        boxShadow: '0 6px 20px rgba(108, 99, 255, 0.5)',
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    borderRadius: 16,
                    border: '1px solid rgba(148, 163, 184, 0.08)',
                    backdropFilter: 'blur(20px)',
                    background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.9) 0%, rgba(17, 24, 39, 0.7) 100%)',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        borderRadius: 10,
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: '#6C63FF',
                            borderWidth: 2,
                        },
                    },
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    background: 'linear-gradient(180deg, #0F1629 0%, #111827 100%)',
                    borderRight: '1px solid rgba(148, 163, 184, 0.08)',
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    fontWeight: 500,
                },
            },
        },
    },
});

export default theme;

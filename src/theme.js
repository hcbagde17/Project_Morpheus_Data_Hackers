import { createTheme } from '@mui/material/styles';

/* ─── Shared tokens ─── */
const sharedTypography = {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
};

const sharedShape = { borderRadius: 12 };

const sharedComponentOverrides = (mode) => ({
    MuiButton: {
        styleOverrides: {
            root: {
                borderRadius: 10,
                padding: '10px 24px',
                fontSize: '0.9rem',
                transition: 'all 0.15s ease',
                '&:hover': { transform: 'scale(1.02)' },
            },
            contained: {
                boxShadow: '0 4px 14px rgba(108, 99, 255, 0.35)',
                '&:hover': {
                    boxShadow: '0 6px 20px rgba(108, 99, 255, 0.5)',
                    transform: 'scale(1.02)',
                },
            },
        },
    },
    MuiCard: {
        styleOverrides: {
            root: {
                backgroundImage: 'none',
                borderRadius: 16,
                border: mode === 'dark'
                    ? '1px solid rgba(148, 163, 184, 0.08)'
                    : '1px solid rgba(0, 0, 0, 0.06)',
                backdropFilter: 'blur(20px)',
                background: mode === 'dark'
                    ? 'linear-gradient(135deg, rgba(17, 24, 39, 0.9) 0%, rgba(17, 24, 39, 0.7) 100%)'
                    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
            },
        },
    },
    MuiPaper: {
        styleOverrides: {
            root: { backgroundImage: 'none' },
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
                background: mode === 'dark'
                    ? 'linear-gradient(180deg, #0F1629 0%, #111827 100%)'
                    : 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                borderRight: mode === 'dark'
                    ? '1px solid rgba(148, 163, 184, 0.08)'
                    : '1px solid rgba(0, 0, 0, 0.06)',
            },
        },
    },
    MuiChip: {
        styleOverrides: {
            root: { borderRadius: 8, fontWeight: 500 },
        },
    },
});

/* ─── Dark Theme ─── */
export function createDarkTheme() {
    return createTheme({
        palette: {
            mode: 'dark',
            primary: { main: '#6C63FF', light: '#8B85FF', dark: '#4B44CC', contrastText: '#fff' },
            secondary: { main: '#00D9FF', light: '#33E1FF', dark: '#00AABB' },
            error: { main: '#FF4D6A', light: '#FF7A8F', dark: '#CC3D55' },
            warning: { main: '#FFB74D', light: '#FFCA80', dark: '#CC923E' },
            success: { main: '#4ECDC4', light: '#7EDBD5', dark: '#3EA49D' },
            background: { default: '#0A0E1A', paper: '#111827' },
            text: { primary: '#F1F5F9', secondary: '#94A3B8' },
            divider: 'rgba(148, 163, 184, 0.12)',
        },
        typography: sharedTypography,
        shape: sharedShape,
        components: sharedComponentOverrides('dark'),
    });
}

/* ─── Light Theme ─── */
export function createLightTheme() {
    return createTheme({
        palette: {
            mode: 'light',
            primary: { main: '#6C63FF', light: '#8B85FF', dark: '#4B44CC', contrastText: '#fff' },
            secondary: { main: '#00AABB', light: '#00D9FF', dark: '#008899' },
            error: { main: '#E53E5D', light: '#FF6B83', dark: '#B92E48' },
            warning: { main: '#ED9A2E', light: '#FFB74D', dark: '#C07B1E' },
            success: { main: '#3BA89F', light: '#4ECDC4', dark: '#2D8A82' },
            background: { default: '#F1F5F9', paper: '#FFFFFF' },
            text: { primary: '#1E293B', secondary: '#64748B' },
            divider: 'rgba(0, 0, 0, 0.08)',
        },
        typography: sharedTypography,
        shape: sharedShape,
        components: sharedComponentOverrides('light'),
    });
}

// Backwards-compatible default export (dark theme)
const theme = createDarkTheme();
export default theme;

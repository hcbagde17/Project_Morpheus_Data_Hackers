import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createDarkTheme, createLightTheme } from './theme';

const ThemeContext = createContext({ mode: 'dark', toggleMode: () => {} });

export function useThemeMode() {
    return useContext(ThemeContext);
}

export default function ThemeContextProvider({ children }) {
    const [mode, setMode] = useState(() => {
        try {
            return localStorage.getItem('pw_theme') || 'dark';
        } catch {
            return 'dark';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('pw_theme', mode);
        } catch {
            // ignore
        }
    }, [mode]);

    const toggleMode = () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));

    const theme = useMemo(
        () => (mode === 'dark' ? createDarkTheme() : createLightTheme()),
        [mode],
    );

    const value = useMemo(() => ({ mode, toggleMode }), [mode]);

    return (
        <ThemeContext.Provider value={value}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </ThemeProvider>
        </ThemeContext.Provider>
    );
}

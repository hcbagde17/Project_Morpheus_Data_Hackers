import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { useEffect } from 'react';
import theme from './theme';
import useAuthStore from './store/authStore';

// Pages
import LoginPage from './pages/LoginPage';
import FirstLoginPage from './pages/FirstLoginPage';
import DashboardRouter from './pages/DashboardRouter';

// Layout
import ProtectedRoute from './components/ProtectedRoute';

function App() {
    const { initialize, loading } = useAuthStore();

    useEffect(() => {
        initialize();
    }, [initialize]);

    if (loading) {
        return (
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    background: '#0A0E1A',
                    color: '#6C63FF',
                    fontSize: '1.5rem',
                    fontFamily: 'Inter, sans-serif',
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: 50,
                            height: 50,
                            border: '3px solid rgba(108, 99, 255, 0.2)',
                            borderTop: '3px solid #6C63FF',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 20px',
                        }} />
                        Loading ProctorWatch...
                    </div>
                </div>
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/first-login" element={
                        <ProtectedRoute>
                            <FirstLoginPage />
                        </ProtectedRoute>
                    } />
                    <Route path="/dashboard/*" element={
                        <ProtectedRoute>
                            <DashboardRouter />
                        </ProtectedRoute>
                    } />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;

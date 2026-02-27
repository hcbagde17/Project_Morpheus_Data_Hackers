import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useTheme } from '@mui/material';
import useAuthStore from './store/authStore';
import ThemeContextProvider from './ThemeContext';

// Pages
import LoginPage from './pages/LoginPage';
import FirstLoginPage from './pages/FirstLoginPage';
import DashboardRouter from './pages/DashboardRouter';

// Layout
import ProtectedRoute from './components/ProtectedRoute';

function AppContent() {
    const { initialize, loading } = useAuthStore();
    const theme = useTheme();

    useEffect(() => {
        initialize();
    }, [initialize]);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                background: theme.palette.background.default,
                color: theme.palette.primary.main,
                fontSize: '1.5rem',
                fontFamily: 'Inter, sans-serif',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 50,
                        height: 50,
                        border: `3px solid ${theme.palette.primary.main}33`,
                        borderTop: `3px solid ${theme.palette.primary.main}`,
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 20px',
                    }} />
                    Loading ProctorWatch...
                </div>
            </div>
        );
    }

    return (
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
    );
}

function App() {
    return (
        <ThemeContextProvider>
            <AppContent />
        </ThemeContextProvider>
    );
}

export default App;

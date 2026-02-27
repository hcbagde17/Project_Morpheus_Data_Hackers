import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
    Box, Card, CardContent, TextField, Button, Typography,
    Alert, InputAdornment, IconButton, CircularProgress,
} from '@mui/material';
import { Visibility, VisibilityOff, Security } from '@mui/icons-material';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, user, error, clearError } = useAuthStore();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    // Redirect if already logged in
    if (user) {
        if (user.first_login) {
            return <Navigate to="/first-login" replace />;
        }
        return <Navigate to="/dashboard" replace />;
    }

    const handleLogin = async (e) => {
        e.preventDefault();
        clearError();
        setLoading(true);
        try {
            const session = await login(username, password);
            if (session.user.first_login) {
                navigate('/first-login');
            } else {
                navigate('/dashboard');
            }
        } catch {
            // Error is set in the store
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(ellipse at 20% 50%, rgba(108, 99, 255, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(0, 217, 255, 0.1) 0%, transparent 50%), #0A0E1A',
            p: 2,
        }}>
            <Box sx={{ width: '100%', maxWidth: 440 }}>
                {/* Logo / Brand */}
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                    <Box sx={{
                        width: 72, height: 72, borderRadius: '20px', mx: 'auto', mb: 2,
                        background: 'linear-gradient(135deg, #6C63FF 0%, #00D9FF 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 8px 32px rgba(108, 99, 255, 0.4)',
                    }}>
                        <Security sx={{ fontSize: 36, color: '#fff' }} />
                    </Box>
                    <Typography variant="h4" fontWeight={700} sx={{
                        background: 'linear-gradient(135deg, #6C63FF, #00D9FF)',
                        backgroundClip: 'text', WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        ProctorWatch
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                        AI-Powered Examination Management
                    </Typography>
                </Box>

                {/* Login Card */}
                <Card sx={{
                    background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95) 0%, rgba(17, 24, 39, 0.85) 100%)',
                    border: '1px solid rgba(108, 99, 255, 0.15)',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                }}>
                    <CardContent sx={{ p: 4 }}>
                        <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
                            Sign In
                        </Typography>

                        {error && (
                            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={clearError}>
                                {error}
                            </Alert>
                        )}

                        <form onSubmit={handleLogin}>
                            <TextField
                                fullWidth label="Username" placeholder="username@pw.com"
                                value={username} onChange={(e) => setUsername(e.target.value)}
                                sx={{ mb: 2 }} required autoFocus
                            />
                            <TextField
                                fullWidth label="Password" type={showPassword ? 'text' : 'password'}
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                sx={{ mb: 3 }} required
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                                                {showPassword ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            <Button
                                fullWidth type="submit" variant="contained" size="large"
                                disabled={loading || !username || !password}
                                sx={{
                                    py: 1.5, fontSize: '1rem',
                                    background: 'linear-gradient(135deg, #6C63FF 0%, #8B85FF 100%)',
                                    '&:hover': { background: 'linear-gradient(135deg, #5B54E6 0%, #7A73FF 100%)' },
                                }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
                            </Button>
                        </form>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
                            Default admin: admin@pw.com / Admin@123
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        </Box>
    );
}

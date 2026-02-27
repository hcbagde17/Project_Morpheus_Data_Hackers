import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Typography, Alert, CircularProgress, Box
} from '@mui/material';
import { AdminPanelSettings, Lock } from '@mui/icons-material';
import useAuthStore from '../store/authStore';

export default function AdminAuthDialog({ open, onClose, onSuccess, title = "Admin Verification Required" }) {
    const { verifyAdmin } = useAuthStore();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleVerify = async () => {
        setLoading(true);
        setError('');
        try {
            const isValid = await verifyAdmin(username, password);
            if (isValid) {
                onSuccess();
                handleClose();
            } else {
                setError('Invalid admin credentials');
            }
        } catch (err) {
            setError(err.message || 'Verification failed');
        }
        setLoading(false);
    };

    const handleClose = () => {
        setUsername('');
        setPassword('');
        setError('');
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AdminPanelSettings color="primary" />
                <Typography variant="h6">{title}</Typography>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Please enter administrator credentials to proceed with this sensitive action.
                    </Typography>

                    {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

                    <TextField
                        fullWidth
                        margin="normal"
                        label="Admin Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoFocus
                    />
                    <TextField
                        fullWidth
                        margin="normal"
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleVerify()}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleVerify}
                    disabled={loading || !username || !password}
                    startIcon={loading ? <CircularProgress size={16} /> : <Lock />}
                >
                    Verify
                </Button>
            </DialogActions>
        </Dialog>
    );
}

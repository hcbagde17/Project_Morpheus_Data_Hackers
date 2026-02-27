import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, FormControlLabel, Switch, Box, Typography, Alert,
    Divider, CircularProgress,
} from '@mui/material';
import { AdminPanelSettings, Warning } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

export default function AdminOverridePanel({ open, onClose, sessionId }) {
    const { verifyAdmin } = useAuthStore();
    const [step, setStep] = useState('auth'); // 'auth' | 'config'
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [reason, setReason] = useState('');
    const [modules, setModules] = useState({
        identity: true,
        device: true,
        behavior: true,
        audio: true,
        network: true,
        object_detection: true,
        enforcement: true, // New: System Enforcement
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleAuth = async () => {
        setLoading(true);
        setError('');
        try {
            const admin = await verifyAdmin(username, password);
            if (!admin) {
                setError('Invalid admin credentials');
                setLoading(false);
                return;
            }
            setStep('config');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleApply = async () => {
        if (!reason.trim()) {
            setError('Reason is required');
            return;
        }

        setLoading(true);
        setError('');
        try {
            // Logic Inversion: If module is FALSE (unchecked), it is DISABLED.
            const disabledModules = Object.keys(modules).filter(k => !modules[k]);

            // Get current admin user
            const { data: adminUser } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();

            // Insert override record
            await supabase.from('module_overrides').insert({
                session_id: sessionId,
                admin_id: adminUser.id,
                disabled_modules: disabledModules,
                reason: reason.trim(),
            });

            // Audit log
            await supabase.from('audit_logs').insert({
                action: 'ADMIN_OVERRIDE_APPLIED',
                user_id: adminUser.id,
                target_type: 'exam_session',
                target_id: sessionId,
                details: { disabled_modules: disabledModules, reason: reason.trim() },
            });

            // Reset and close
            setStep('auth');
            setUsername('');
            setPassword('');
            setReason('');
            setModules({
                identity: true, device: true, behavior: true, audio: true,
                network: true, object_detection: true, enforcement: true
            });
            onClose(disabledModules); // Pass disabled modules back
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleClose = () => {
        setStep('auth');
        setUsername('');
        setPassword('');
        setReason('');
        setError('');
        setModules({
            identity: true, device: true, behavior: true, audio: true,
            network: true, object_detection: true, enforcement: true
        });
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,77,106,0.1)' }}>
                <AdminPanelSettings sx={{ color: '#FF4D6A' }} />
                <Typography component="span" variant="subtitle1" fontWeight={700}>Live Admin Override</Typography>
            </DialogTitle>

            <DialogContent sx={{ mt: 2 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

                {step === 'auth' ? (
                    <Box>
                        <Alert severity="warning" icon={<Warning />} sx={{ mb: 2 }}>
                            This panel allows authorized admins to disable proctoring modules during a live exam. All actions are audited.
                        </Alert>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Enter admin credentials to proceed:
                        </Typography>
                        <TextField
                            fullWidth
                            label="Admin Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            sx={{ mb: 2 }}
                            autoFocus
                        />
                        <TextField
                            fullWidth
                            label="Admin Password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyPress={e => { if (e.key === 'Enter') handleAuth(); }}
                        />
                    </Box>
                ) : (
                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Uncheck modules to DISABLE them for this session:
                        </Typography>

                        <Box sx={{ bgcolor: 'rgba(148,163,184,0.04)', p: 2, borderRadius: 2, mb: 2 }}>
                            {Object.keys(modules).map(module => (
                                <FormControlLabel
                                    key={module}
                                    control={
                                        <Switch
                                            checked={modules[module]}
                                            onChange={e => setModules({ ...modules, [module]: e.target.checked })}
                                            color="success" // Green for Active
                                        />
                                    }
                                    label={
                                        <Typography variant="body2" sx={{
                                            textTransform: 'capitalize',
                                            color: modules[module] ? 'text.primary' : 'text.disabled',
                                            textDecoration: modules[module] ? 'none' : 'line-through'
                                        }}>
                                            {module.replace('_', ' ')} Monitor {modules[module] ? '(Active)' : '(Disabled)'}
                                        </Typography>
                                    }
                                    sx={{ display: 'block', mb: 0.5 }}
                                />
                            ))}
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Reason (required)"
                            placeholder="Enter detailed reason for this override..."
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            helperText="This will be recorded in the audit log"
                        />
                    </Box>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                {step === 'auth' ? (
                    <Button
                        variant="contained"
                        onClick={handleAuth}
                        disabled={loading || !username || !password}
                        startIcon={loading ? <CircularProgress size={18} /> : <AdminPanelSettings />}
                    >
                        Verify
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        color="warning"
                        onClick={handleApply}
                        disabled={loading || !reason.trim()}
                        startIcon={loading ? <CircularProgress size={18} /> : null}
                    >
                        Apply Override
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

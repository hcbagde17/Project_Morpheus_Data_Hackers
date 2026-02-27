import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Typography, Alert, CircularProgress, Box, Tabs, Tab,
} from '@mui/material';
import { AdminPanelSettings, Lock, Key } from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

/**
 * AdminAuthDialog — used wherever a sensitive action needs admin authorisation
 * before `onSuccess` is called (e.g. Face ID reset on the Student Dashboard).
 *
 * Two auth paths (tabs):
 *  Tab 0 – Admin Credentials  (username + password via verifyAdmin)
 *  Tab 1 – Override Code      (6-char single-use code from override_codes table)
 *
 * The `onSuccess` callback is called with no arguments once auth passes.
 * The caller is responsible for performing the actual action inside onSuccess.
 */
export default function AdminAuthDialog({
    open,
    onClose,
    onSuccess,
    title = 'Admin Verification Required',
}) {
    const { user, verifyAdmin } = useAuthStore();

    // Tab: 0 = Admin Credentials, 1 = Override Code
    const [authTab, setAuthTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Credentials fields
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Override code field
    const [overrideCode, setOverrideCode] = useState('');

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleCredentialsVerify = async () => {
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

    const handleCodeVerify = async () => {
        const trimmed = overrideCode.trim().toUpperCase();
        if (trimmed.length !== 6) {
            setError('Please enter a valid 6-character override code');
            return;
        }
        setLoading(true);
        setError('');
        try {
            // Look up the code — must be unused, not expired, and for face_reset purpose
            const { data: codeRow, error: fetchErr } = await supabase
                .from('override_codes')
                .select('*')
                .eq('code', trimmed)
                .eq('used', false)
                .gt('expires_at', new Date().toISOString())
                .single();

            if (fetchErr || !codeRow) {
                setError('Invalid, already used, or expired override code');
                setLoading(false);
                return;
            }

            // Validate purpose matches — only face_reset codes are accepted here
            if (codeRow.purpose !== 'face_reset') {
                setError('This code is for module override, not Face ID reset. Please use the correct code.');
                setLoading(false);
                return;
            }

            // Mark as used immediately to prevent replay
            await supabase.from('override_codes').update({
                used: true,
                used_at: new Date().toISOString(),
                used_by: user?.id ?? null,
            }).eq('id', codeRow.id);

            // Log to audit
            await supabase.from('audit_logs').insert({
                action: 'FACE_ID_RESET_CODE_VERIFIED',
                user_id: user?.id,
                target_type: 'user',
                target_id: user?.id,
                details: {
                    override_code_id: codeRow.id,
                    created_by: codeRow.created_by,
                    via: 'override_code',
                },
            });

            onSuccess();
            handleClose();
        } catch (err) {
            setError(err.message || 'Verification failed');
        }
        setLoading(false);
    };

    const handleClose = () => {
        setAuthTab(0);
        setUsername('');
        setPassword('');
        setOverrideCode('');
        setError('');
        onClose();
    };

    const canVerify = authTab === 0
        ? (!!username && !!password)
        : overrideCode.length === 6;

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AdminPanelSettings color="primary" />
                <Typography variant="h6">{title}</Typography>
            </DialogTitle>

            <DialogContent>
                <Box sx={{ mt: 1 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

                    {/* Tab selector */}
                    <Tabs
                        value={authTab}
                        onChange={(_, v) => { setAuthTab(v); setError(''); }}
                        textColor="primary"
                        indicatorColor="primary"
                        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                        <Tab
                            icon={<AdminPanelSettings fontSize="small" />}
                            iconPosition="start"
                            label="Admin Credentials"
                            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                        />
                        <Tab
                            icon={<Key fontSize="small" />}
                            iconPosition="start"
                            label="Override Code"
                            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                        />
                    </Tabs>

                    {/* Tab 0 — Admin Credentials */}
                    {authTab === 0 && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                Please enter administrator credentials to proceed with this sensitive action.
                            </Typography>
                            <TextField
                                fullWidth margin="normal" label="Admin Username"
                                value={username} onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                            />
                            <TextField
                                fullWidth margin="normal" label="Password" type="password"
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && canVerify && handleCredentialsVerify()}
                            />
                        </Box>
                    )}

                    {/* Tab 1 — Override Code */}
                    {authTab === 1 && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Enter the 6-character <strong>Face ID Reset</strong> code provided by your administrator:
                            </Typography>
                            <TextField
                                fullWidth
                                label="Override Code"
                                placeholder="e.g. AB3X7Q"
                                value={overrideCode}
                                onChange={e => setOverrideCode(e.target.value.toUpperCase())}
                                onKeyPress={e => e.key === 'Enter' && canVerify && handleCodeVerify()}
                                inputProps={{
                                    maxLength: 6,
                                    style: {
                                        fontFamily: 'monospace',
                                        fontSize: 28,
                                        letterSpacing: 10,
                                        textAlign: 'center',
                                    },
                                }}
                                autoFocus
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Codes are valid for <strong>5 minutes</strong>, single-use, and must be
                                generated for <strong>Face ID Reset</strong> purpose.
                            </Typography>
                        </Box>
                    )}
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={authTab === 0 ? handleCredentialsVerify : handleCodeVerify}
                    disabled={loading || !canVerify}
                    startIcon={loading ? <CircularProgress size={16} /> : <Lock />}
                >
                    Verify
                </Button>
            </DialogActions>
        </Dialog>
    );
}

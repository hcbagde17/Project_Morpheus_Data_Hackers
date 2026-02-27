import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, FormControlLabel, Switch, Box, Typography, Alert,
    Divider, CircularProgress, Tabs, Tab, Chip,
} from '@mui/material';
import {
    AdminPanelSettings, Warning, Key, Fingerprint, LockOpen,
} from '@mui/icons-material';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

// ─── Helper: parse purpose returned by override code ────────────────────────
// purpose: 'module_override' | 'face_reset'

// ─── Default module state ────────────────────────────────────────────────────
const DEFAULT_MODULES = {
    identity: true,
    device: true,
    behavior: true,
    audio: true,
    network: true,
    object_detection: true,
    enforcement: true,
};

export default function AdminOverridePanel({ open, onClose, sessionId, studentId }) {
    const { user, verifyAdmin } = useAuthStore();

    // ── Auth method: 0 = Admin Credentials, 1 = Override Code ──
    const [authTab, setAuthTab] = useState(0);

    // ── Shared step state ──
    const [step, setStep] = useState('auth'); // 'auth' | 'config'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [reason, setReason] = useState('');
    const [modules, setModules] = useState({ ...DEFAULT_MODULES });

    // ── Resolved after auth (code path) ──
    const [resolvedPurpose, setResolvedPurpose] = useState('module_override');
    const [resolvedCodeId, setResolvedCodeId] = useState(null);   // override_codes.id for audit
    const [resolvedAdminId, setResolvedAdminId] = useState(null); // override_codes.created_by

    // ── Admin Credentials fields ──
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // ── Override Code field ──
    const [overrideCode, setOverrideCode] = useState('');

    // ────────────────────────────────────────────────────────────────────────────
    // AUTH HANDLERS
    // ────────────────────────────────────────────────────────────────────────────

    /** Path A — Admin Credentials (original flow) */
    const handleCredentialsAuth = async () => {
        setLoading(true);
        setError('');
        try {
            const admin = await verifyAdmin(username, password);
            if (!admin) {
                setError('Invalid admin credentials');
                setLoading(false);
                return;
            }
            // Credentials path always unlocks module_override
            setResolvedPurpose('module_override');
            setResolvedAdminId(null); // will be looked up in handleApply by username
            setStep('config');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    /** Path B — Single-Use Override Code */
    const handleCodeAuth = async () => {
        const trimmed = overrideCode.trim().toUpperCase();
        if (trimmed.length !== 6) {
            setError('Please enter a valid 6-character override code');
            return;
        }
        setLoading(true);
        setError('');
        try {
            // Look up the code — must be unused and not expired
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

            // Mark as used immediately so it cannot be replayed
            await supabase.from('override_codes').update({
                used: true,
                used_at: new Date().toISOString(),
                used_by: user?.id ?? null,
            }).eq('id', codeRow.id);

            setResolvedPurpose(codeRow.purpose);
            setResolvedCodeId(codeRow.id);
            setResolvedAdminId(codeRow.created_by);
            setStep('config');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    // ────────────────────────────────────────────────────────────────────────────
    // APPLY HANDLERS
    // ────────────────────────────────────────────────────────────────────────────

    const handleApply = async () => {
        if (!reason.trim()) {
            setError('Reason is required');
            return;
        }
        setLoading(true);
        setError('');
        try {
            if (resolvedPurpose === 'module_override') {
                await applyModuleOverride();
            } else if (resolvedPurpose === 'face_reset') {
                await applyFaceReset();
            }
            handleClose();
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const applyModuleOverride = async () => {
        const disabledModules = Object.keys(modules).filter(k => !modules[k]);

        // Resolve admin ID (credentials path looks up by username)
        let adminId = resolvedAdminId;
        if (!adminId && username) {
            const { data: adminUser } = await supabase
                .from('users').select('id').eq('username', username).single();
            adminId = adminUser?.id;
        }

        await supabase.from('module_overrides').insert({
            session_id: sessionId,
            admin_id: adminId,
            disabled_modules: disabledModules,
            reason: reason.trim(),
        });

        await supabase.from('audit_logs').insert({
            action: 'ADMIN_OVERRIDE_APPLIED',
            user_id: adminId ?? user?.id,
            target_type: 'exam_session',
            target_id: sessionId,
            details: {
                disabled_modules: disabledModules,
                reason: reason.trim(),
                via: resolvedCodeId ? 'override_code' : 'admin_credentials',
            },
        });

        onClose(disabledModules);
    };

    const applyFaceReset = async () => {
        const targetStudentId = studentId ?? user?.id;

        // Delete face registration for the student
        await supabase.from('face_registrations')
            .delete()
            .eq('user_id', targetStudentId);

        await supabase.from('audit_logs').insert({
            action: 'FACE_ID_RESET',
            user_id: resolvedAdminId ?? user?.id,
            target_type: 'user',
            target_id: targetStudentId,
            details: {
                reason: reason.trim(),
                via: resolvedCodeId ? 'override_code' : 'admin_credentials',
                session_id: sessionId,
            },
        });

        onClose([]); // No modules to disable
    };

    // ────────────────────────────────────────────────────────────────────────────
    // CLOSE / RESET
    // ────────────────────────────────────────────────────────────────────────────

    const handleClose = () => {
        setStep('auth');
        setAuthTab(0);
        setUsername('');
        setPassword('');
        setOverrideCode('');
        setReason('');
        setError('');
        setModules({ ...DEFAULT_MODULES });
        setResolvedPurpose('module_override');
        setResolvedCodeId(null);
        setResolvedAdminId(null);
        onClose();
    };

    // ────────────────────────────────────────────────────────────────────────────
    // RENDER
    // ────────────────────────────────────────────────────────────────────────────

    const isFaceReset = resolvedPurpose === 'face_reset';

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,77,106,0.08)' }}>
                <AdminPanelSettings sx={{ color: '#FF4D6A' }} />
                <Typography component="span" variant="subtitle1" fontWeight={700}>Live Admin Override</Typography>
            </DialogTitle>

            <DialogContent sx={{ mt: 2 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

                {/* ── STEP 1: Auth ── */}
                {step === 'auth' && (
                    <Box>
                        <Alert severity="warning" icon={<Warning />} sx={{ mb: 2 }}>
                            This panel allows authorized overrides during a live exam. All actions are audited.
                        </Alert>

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
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                            />
                            <Tab
                                icon={<Key fontSize="small" />}
                                iconPosition="start"
                                label="Override Code"
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                            />
                        </Tabs>

                        {/* Tab A — Admin Credentials */}
                        {authTab === 0 && (
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Enter admin credentials to proceed:
                                </Typography>
                                <TextField
                                    fullWidth label="Admin Username"
                                    value={username} onChange={e => setUsername(e.target.value)}
                                    sx={{ mb: 2 }} autoFocus
                                />
                                <TextField
                                    fullWidth label="Admin Password" type="password"
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    onKeyPress={e => { if (e.key === 'Enter') handleCredentialsAuth(); }}
                                />
                            </Box>
                        )}

                        {/* Tab B — Override Code */}
                        {authTab === 1 && (
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Enter the 6-character override code provided by your admin:
                                </Typography>
                                <TextField
                                    fullWidth
                                    label="Override Code"
                                    placeholder="e.g. AB3X7Q"
                                    value={overrideCode}
                                    onChange={e => setOverrideCode(e.target.value.toUpperCase())}
                                    onKeyPress={e => { if (e.key === 'Enter') handleCodeAuth(); }}
                                    inputProps={{
                                        maxLength: 6,
                                        style: { fontFamily: 'monospace', fontSize: 24, letterSpacing: 8, textAlign: 'center' },
                                    }}
                                    autoFocus
                                />
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    Codes are valid for <strong>5 minutes</strong> and can only be used <strong>once</strong>.
                                    The purpose (module override or face ID reset) is determined by the code.
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}

                {/* ── STEP 2: Config ── */}
                {step === 'config' && (
                    <Box>
                        {/* Purpose badge */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            {isFaceReset
                                ? <Fingerprint sx={{ color: '#6C63FF' }} />
                                : <LockOpen sx={{ color: '#FFB74D' }} />}
                            <Chip
                                label={isFaceReset ? 'Face ID Reset' : 'Module Override'}
                                color={isFaceReset ? 'primary' : 'warning'}
                                size="small"
                                variant="outlined"
                            />
                            {resolvedCodeId && (
                                <Chip label="via Override Code" size="small" variant="outlined" sx={{ ml: 'auto' }} />
                            )}
                        </Box>

                        {/* Module Override config */}
                        {!isFaceReset && (
                            <>
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
                                                    color="success"
                                                />
                                            }
                                            label={
                                                <Typography variant="body2" sx={{
                                                    textTransform: 'capitalize',
                                                    color: modules[module] ? 'text.primary' : 'text.disabled',
                                                    textDecoration: modules[module] ? 'none' : 'line-through',
                                                }}>
                                                    {module.replace('_', ' ')} Monitor {modules[module] ? '(Active)' : '(Disabled)'}
                                                </Typography>
                                            }
                                            sx={{ display: 'block', mb: 0.5 }}
                                        />
                                    ))}
                                </Box>
                            </>
                        )}

                        {/* Face Reset config */}
                        {isFaceReset && (
                            <Alert severity="warning" icon={<Fingerprint />} sx={{ mb: 2 }}>
                                This will <strong>permanently delete</strong> the student's stored face data.
                                They will need to re-register their face before proctoring features work again.
                            </Alert>
                        )}

                        <Divider sx={{ my: 2 }} />

                        <TextField
                            fullWidth multiline rows={3}
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
                        onClick={authTab === 0 ? handleCredentialsAuth : handleCodeAuth}
                        disabled={loading || (authTab === 0 ? (!username || !password) : overrideCode.length < 6)}
                        startIcon={loading ? <CircularProgress size={18} /> : (authTab === 0 ? <AdminPanelSettings /> : <Key />)}
                    >
                        Verify
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        color={isFaceReset ? 'error' : 'warning'}
                        onClick={handleApply}
                        disabled={loading || !reason.trim()}
                        startIcon={loading ? <CircularProgress size={18} /> : (isFaceReset ? <Fingerprint /> : <LockOpen />)}
                    >
                        {isFaceReset ? 'Reset Face ID' : 'Apply Override'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

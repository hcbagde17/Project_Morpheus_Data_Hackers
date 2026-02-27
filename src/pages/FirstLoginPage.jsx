import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, TextField, Button, Typography,
    Alert, Stepper, Step, StepLabel, Avatar, CircularProgress,
} from '@mui/material';
import { LockReset, CameraAlt, CheckCircle, Gavel } from '@mui/icons-material';
import { useTheme } from '@mui/material';
import useAuthStore from '../store/authStore';
import { supabase } from '../lib/supabase';

const steps = ['Change Password', 'Upload Photo', 'Accept Consent'];

export default function FirstLoginPage() {
    const navigate = useNavigate();
    const { user, changePassword, logout } = useAuthStore();
    const [activeStep, setActiveStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // Password step
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Photo step
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoFile, setPhotoFile] = useState(null);

    if (!user) return null;

    const handlePasswordChange = async () => {
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            // For first login, directly update the password hash (no old password needed)
            const encoder = new TextEncoder();
            const data = encoder.encode(newPassword);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const newHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            const { error: updateError } = await supabase.from('users')
                .update({ password_hash: newHash })
                .eq('id', user.id);

            if (updateError) throw updateError;

            setActiveStep(1);
            setError('');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handlePhotoUpload = async () => {
        if (!photoFile) {
            setError('Please select a photo');
            return;
        }
        setLoading(true);
        try {
            const fileExt = photoFile.name.split('.').pop();
            const filePath = `${user.id}/profile.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('profile-photos')
                .upload(filePath, photoFile, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('profile-photos')
                .getPublicUrl(filePath);

            await supabase.from('users')
                .update({ profile_photo_url: publicUrl })
                .eq('id', user.id);

            setActiveStep(2);
            setError('');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleConsentAccept = async () => {
        setLoading(true);
        try {
            await supabase.from('consents').insert({
                user_id: user.id,
                consent_type: 'terms_and_conditions',
            });

            await supabase.from('users')
                .update({ first_login: false })
                .eq('id', user.id);

            // Update local session AND Zustand store
            const stored = JSON.parse(localStorage.getItem('pw_session'));
            stored.user.first_login = false;
            localStorage.setItem('pw_session', JSON.stringify(stored));

            // Update Zustand store so ProtectedRoute sees the change
            useAuthStore.setState({ user: { ...user, first_login: false } });

            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setPhotoPreview(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    return (
        <Box sx={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isDark
                ? `radial-gradient(ellipse at 30% 40%, rgba(108, 99, 255, 0.12) 0%, transparent 60%), ${theme.palette.background.default}`
                : `radial-gradient(ellipse at 30% 40%, rgba(108, 99, 255, 0.06) 0%, transparent 60%), ${theme.palette.background.default}`,
            p: 2,
        }}>
            <Box sx={{ width: '100%', maxWidth: 520 }}>
                <Typography variant="h5" textAlign="center" fontWeight={700} gutterBottom sx={{ mb: 1 }}>
                    Welcome to ProctorWatch
                </Typography>
                <Typography color="text.secondary" textAlign="center" sx={{ mb: 4 }}>
                    Complete these steps to set up your account
                </Typography>

                <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                <Card sx={{ border: '1px solid rgba(108, 99, 255, 0.15)' }}>
                    <CardContent sx={{ p: 4 }}>
                        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

                        {/* Step 1: Change Password */}
                        {activeStep === 0 && (
                            <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                                    <LockReset color="primary" />
                                    <Typography variant="h6">Change Your Password</Typography>
                                </Box>
                                <TextField
                                    fullWidth label="New Password" type="password"
                                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                                    sx={{ mb: 2 }} helperText="Minimum 8 characters"
                                />
                                <TextField
                                    fullWidth label="Confirm Password" type="password"
                                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                    sx={{ mb: 3 }}
                                />
                                <Button fullWidth variant="contained" onClick={handlePasswordChange}
                                    disabled={loading}>
                                    {loading ? <CircularProgress size={22} /> : 'Set Password'}
                                </Button>
                            </Box>
                        )}

                        {/* Step 2: Upload Photo */}
                        {activeStep === 1 && (
                            <Box sx={{ textAlign: 'center' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, justifyContent: 'center' }}>
                                    <CameraAlt color="primary" />
                                    <Typography variant="h6">Upload Profile Photo</Typography>
                                </Box>
                                <Avatar
                                    src={photoPreview}
                                    sx={{ width: 120, height: 120, mx: 'auto', mb: 2, border: '3px solid rgba(108, 99, 255, 0.3)' }}
                                />
                                <input type="file" accept="image/*" onChange={handleFileChange}
                                    id="photo-upload" style={{ display: 'none' }} />
                                <label htmlFor="photo-upload">
                                    <Button component="span" variant="outlined" sx={{ mb: 3 }}>
                                        Choose Photo
                                    </Button>
                                </label>
                                <br />
                                <Button fullWidth variant="contained" onClick={handlePhotoUpload}
                                    disabled={loading || !photoFile}>
                                    {loading ? <CircularProgress size={22} /> : 'Upload & Continue'}
                                </Button>
                            </Box>
                        )}

                        {/* Step 3: Consent */}
                        {activeStep === 2 && (
                            <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                                    <Gavel color="primary" />
                                    <Typography variant="h6">Accept Terms & Conditions</Typography>
                                </Box>
                                <Box sx={{
                                    maxHeight: 200, overflowY: 'auto', p: 2, borderRadius: 2,
                                    background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)', mb: 3, fontSize: '0.85rem',
                                    color: 'text.secondary',
                                }}>
                                    <Typography variant="body2" gutterBottom>
                                        By using ProctorWatch, you agree to the following:
                                    </Typography>
                                    <Typography variant="body2" paragraph>
                                        1. Your webcam and microphone may be monitored during examinations.
                                    </Typography>
                                    <Typography variant="body2" paragraph>
                                        2. Video clips and screenshots may be recorded as evidence.
                                    </Typography>
                                    <Typography variant="body2" paragraph>
                                        3. AI-based behavioral analysis will be used during exams.
                                    </Typography>
                                    <Typography variant="body2" paragraph>
                                        4. You agree to comply with academic integrity policies.
                                    </Typography>
                                    <Typography variant="body2" paragraph>
                                        5. Your data will be stored securely and used only for examination purposes.
                                    </Typography>
                                </Box>
                                <Button fullWidth variant="contained" onClick={handleConsentAccept}
                                    disabled={loading} startIcon={<CheckCircle />}>
                                    {loading ? <CircularProgress size={22} /> : 'I Accept & Continue'}
                                </Button>
                            </Box>
                        )}
                    </CardContent>
                </Card>

                <Button onClick={logout} sx={{ mt: 2, display: 'block', mx: 'auto' }} color="inherit" size="small">
                    Sign out
                </Button>
            </Box>
        </Box>
    );
}

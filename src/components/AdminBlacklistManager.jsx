import { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, TextField, Button, Switch, IconButton, Chip,
    Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions,
    Card, CardContent, Alert, Snackbar, InputAdornment, Divider,
    List, ListItem, ListItemText, ListItemSecondaryAction,
    CircularProgress, Tooltip, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { Add, Delete, Search, Shield, Block, CheckCircle, Refresh } from '@mui/icons-material';
import { supabase } from '../lib/supabase';

// Category display config — now includes all 11 categories
const CATEGORY_CONFIG = {
    remote: { label: 'Remote Desktop', color: '#F44336' },
    recording: { label: 'Screen Recording', color: '#FF9800' },
    virtual_machine: { label: 'Virtual Machines', color: '#9C27B0' },
    communication: { label: 'Communication', color: '#673AB7' },
    ai_notes: { label: 'AI & Notes', color: '#E91E63' },
    browsers: { label: 'Browsers', color: '#2196F3' },
    vpn: { label: 'VPN', color: '#FF5722' },
    gaming: { label: 'Gaming', color: '#4CAF50' },
    system: { label: 'System Tools', color: '#607D8B' },
    programming: { label: 'Programming', color: '#00BCD4' },
    utilities: { label: 'Utilities', color: '#795548' },
    custom: { label: 'Custom', color: '#FFC107' },
};

export default function AdminBlacklistManager() {
    const [apps, setApps] = useState([]);
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [newApp, setNewApp] = useState({ name: '', displayName: '', category: 'custom' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);   // process_name of row being saved
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    // ─── Load from Supabase ───────────────────────────────────────────────────
    const loadApps = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_blacklist')
                .select('*')
                .order('category')
                .order('display_name');

            if (error) throw error;
            setApps(data || []);
        } catch (err) {
            console.error('Failed to load blacklist:', err);
            setSnackbar({ open: true, message: 'Failed to load blacklist from database', severity: 'error' });
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadApps(); }, [loadApps]);

    // ─── Toggle whitelist ─────────────────────────────────────────────────────
    // The app STAYS in the list — only is_whitelisted flips.
    const toggleWhitelist = async (app) => {
        const newVal = !app.is_whitelisted;
        setSaving(app.process_name);

        // Optimistic update
        setApps(prev => prev.map(a =>
            a.process_name === app.process_name ? { ...a, is_whitelisted: newVal } : a
        ));

        try {
            const { error } = await supabase
                .from('app_blacklist')
                .update({ is_whitelisted: newVal })
                .eq('process_name', app.process_name);

            if (error) throw error;

            // Sync to Electron enforcement at runtime if available
            if (window.electronAPI?.setWhitelist) {
                const whitelisted = apps
                    .filter(a => (a.process_name === app.process_name ? newVal : a.is_whitelisted))
                    .map(a => a.process_name);
                await window.electronAPI.setWhitelist(whitelisted);
            }

            setSnackbar({
                open: true,
                message: newVal
                    ? `${app.display_name} is now ALLOWED (whitelisted)`
                    : `${app.display_name} is now BLOCKED`,
                severity: newVal ? 'success' : 'warning'
            });
        } catch (err) {
            // Rollback optimistic update
            setApps(prev => prev.map(a =>
                a.process_name === app.process_name ? { ...a, is_whitelisted: !newVal } : a
            ));
            setSnackbar({ open: true, message: `Failed to update: ${err.message}`, severity: 'error' });
        }

        setSaving(null);
    };

    // ─── Add custom app ───────────────────────────────────────────────────────
    const handleAddApp = async () => {
        if (!newApp.name.trim()) return;

        const processName = newApp.name.toLowerCase().endsWith('.exe')
            ? newApp.name.toLowerCase()
            : `${newApp.name.toLowerCase()}.exe`;

        const displayName = newApp.displayName.trim() || newApp.name;

        setSaving('__adding__');
        try {
            const { data, error } = await supabase
                .from('app_blacklist')
                .insert({
                    process_name: processName,
                    display_name: displayName,
                    category: newApp.category,
                    is_default: false,
                    is_whitelisted: false,
                })
                .select()
                .single();

            if (error) throw error;

            setApps(prev => [...prev, data]);

            // Also push to Electron
            if (window.electronAPI?.addToBlacklist) {
                await window.electronAPI.addToBlacklist(processName);
            }

            setNewApp({ name: '', displayName: '', category: 'custom' });
            setAddDialogOpen(false);
            setSnackbar({ open: true, message: `${processName} added to blacklist`, severity: 'success' });
        } catch (err) {
            setSnackbar({ open: true, message: `Failed to add: ${err.message}`, severity: 'error' });
        }
        setSaving(null);
    };

    // ─── Remove custom app (non-default only) ────────────────────────────────
    const handleRemoveApp = async (app) => {
        setSaving(app.process_name);
        try {
            const { error } = await supabase
                .from('app_blacklist')
                .delete()
                .eq('process_name', app.process_name);

            if (error) throw error;

            setApps(prev => prev.filter(a => a.process_name !== app.process_name));

            if (window.electronAPI?.removeFromBlacklist) {
                await window.electronAPI.removeFromBlacklist(app.process_name);
            }

            setSnackbar({ open: true, message: `${app.process_name} removed`, severity: 'info' });
        } catch (err) {
            setSnackbar({ open: true, message: `Failed to remove: ${err.message}`, severity: 'error' });
        }
        setSaving(null);
    };

    // ─── Filter ───────────────────────────────────────────────────────────────
    const filteredApps = apps.filter(app => {
        const matchTab = activeTab === 'all' || app.category === activeTab;
        const matchSearch = !searchTerm ||
            app.process_name.includes(searchTerm.toLowerCase()) ||
            app.display_name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchTab && matchSearch;
    });

    const blockedCount = apps.filter(a => !a.is_whitelisted).length;
    const allowedCount = apps.filter(a => a.is_whitelisted).length;
    const customCount = apps.filter(a => !a.is_default).length;

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 6, gap: 2 }}>
                <CircularProgress size={28} />
                <Typography color="text.secondary">Loading blacklist from database...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                <Shield sx={{ fontSize: 32, color: '#F44336' }} />
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h5" fontWeight={700}>Application Blacklist Manager</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Manage which applications are blocked during exams. Changes sync to Supabase instantly.
                    </Typography>
                </Box>
                <Tooltip title="Refresh from database">
                    <IconButton onClick={loadApps}><Refresh /></IconButton>
                </Tooltip>
            </Box>

            {/* Stats */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <Card sx={{ flex: 1, bgcolor: 'rgba(244, 67, 54, 0.08)', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="h4" fontWeight={700} color="#F44336">{blockedCount}</Typography>
                        <Typography variant="body2" color="text.secondary">Blocked Apps</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ flex: 1, bgcolor: 'rgba(76, 175, 80, 0.08)', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="h4" fontWeight={700} color="#4CAF50">{allowedCount}</Typography>
                        <Typography variant="body2" color="text.secondary">Whitelisted</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ flex: 1, bgcolor: 'rgba(255, 193, 7, 0.08)', border: '1px solid rgba(255, 193, 7, 0.3)' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="h4" fontWeight={700} color="#FFC107">{customCount}</Typography>
                        <Typography variant="body2" color="text.secondary">Custom Added</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ flex: 1, bgcolor: 'rgba(33, 150, 243, 0.08)', border: '1px solid rgba(33, 150, 243, 0.3)' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="h4" fontWeight={700} color="#2196F3">{apps.length}</Typography>
                        <Typography variant="body2" color="text.secondary">Total Apps</Typography>
                    </CardContent>
                </Card>
            </Box>

            {/* Search + Add */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField
                    size="small"
                    placeholder="Search by name or process..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                    sx={{ flex: 1 }}
                />
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => setAddDialogOpen(true)}
                    sx={{ bgcolor: '#FFC107', color: '#000', '&:hover': { bgcolor: '#FFB300' } }}
                >
                    Add Custom App
                </Button>
            </Box>

            {/* Category Tabs */}
            <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            >
                <Tab label={`All (${apps.length})`} value="all" />
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                    const count = apps.filter(a => a.category === key).length;
                    if (count === 0) return null;
                    return (
                        <Tab
                            key={key}
                            value={key}
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {cfg.label}
                                    <Chip label={count} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: `${cfg.color}22`, color: cfg.color }} />
                                </Box>
                            }
                        />
                    );
                })}
            </Tabs>

            {/* App List */}
            <List sx={{ bgcolor: 'action.hover', borderRadius: 2 }}>
                {filteredApps.length === 0 && (
                    <ListItem>
                        <ListItemText primary="No applications found" secondary="Try a different search or category" />
                    </ListItem>
                )}

                {filteredApps.map((app, i) => {
                    const catColor = CATEGORY_CONFIG[app.category]?.color || '#9E9E9E';
                    const isSaving = saving === app.process_name;

                    return (
                        <Box key={app.process_name}>
                            <ListItem sx={{ py: 1, opacity: app.is_whitelisted ? 0.6 : 1, transition: 'opacity 200ms' }}>
                                {/* Status icon */}
                                <Box sx={{ mr: 1.5, flexShrink: 0 }}>
                                    {app.is_whitelisted
                                        ? <CheckCircle sx={{ color: '#4CAF50', fontSize: 20 }} />
                                        : <Block sx={{ color: '#F44336', fontSize: 20 }} />
                                    }
                                </Box>

                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                            <Typography
                                                variant="body1"
                                                fontWeight={500}
                                                sx={{ textDecoration: app.is_whitelisted ? 'line-through' : 'none', color: 'text.primary' }}
                                            >
                                                {app.display_name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                                {app.process_name}
                                            </Typography>
                                            <Chip
                                                label={CATEGORY_CONFIG[app.category]?.label || app.category}
                                                size="small"
                                                sx={{ bgcolor: `${catColor}22`, color: catColor, fontSize: '0.65rem', height: 18 }}
                                            />
                                            {!app.is_default && (
                                                <Chip label="custom" size="small" sx={{ bgcolor: 'rgba(255,193,7,0.15)', color: '#FFC107', fontSize: '0.65rem', height: 18 }} />
                                            )}
                                        </Box>
                                    }
                                />

                                <ListItemSecondaryAction sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="caption" sx={{ color: app.is_whitelisted ? '#4CAF50' : '#F44336', minWidth: 50, textAlign: 'right' }}>
                                        {app.is_whitelisted ? 'Allowed' : 'Blocked'}
                                    </Typography>

                                    {isSaving
                                        ? <CircularProgress size={20} sx={{ mx: 1 }} />
                                        : (
                                            <Tooltip title={app.is_whitelisted ? 'Click to block this app' : 'Click to whitelist (allow) this app'}>
                                                <Switch
                                                    checked={!app.is_whitelisted}
                                                    onChange={() => toggleWhitelist(app)}
                                                    size="small"
                                                    sx={{
                                                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#F44336' },
                                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#F44336' },
                                                    }}
                                                />
                                            </Tooltip>
                                        )
                                    }

                                    {!app.is_default && (
                                        <Tooltip title="Remove custom app from database">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleRemoveApp(app)}
                                                disabled={isSaving}
                                                sx={{ color: '#F44336' }}
                                            >
                                                <Delete fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </ListItemSecondaryAction>
                            </ListItem>
                            {i < filteredApps.length - 1 && <Divider sx={{ opacity: 0.1 }} />}
                        </Box>
                    );
                })}
            </List>

            {/* Add Custom App Dialog */}
            <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Custom Application to Blacklist</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Enter the exact process name as it appears in Task Manager. Changes are saved to Supabase.
                    </Alert>
                    <TextField
                        autoFocus fullWidth
                        label="Process Name"
                        placeholder="example.exe"
                        value={newApp.name}
                        onChange={(e) => setNewApp(p => ({ ...p, name: e.target.value }))}
                        sx={{ mb: 2 }}
                        helperText=".exe is added automatically if omitted"
                    />
                    <TextField
                        fullWidth
                        label="Display Name (optional)"
                        placeholder="Example App"
                        value={newApp.displayName}
                        onChange={(e) => setNewApp(p => ({ ...p, displayName: e.target.value }))}
                        sx={{ mb: 2 }}
                    />
                    <FormControl fullWidth size="small">
                        <InputLabel>Category</InputLabel>
                        <Select
                            value={newApp.category}
                            label="Category"
                            onChange={(e) => setNewApp(p => ({ ...p, category: e.target.value }))}
                        >
                            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                                <MenuItem key={key} value={key}>{cfg.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleAddApp}
                        variant="contained"
                        disabled={!newApp.name.trim() || saving === '__adding__'}
                        startIcon={saving === '__adding__' ? <CircularProgress size={16} color="inherit" /> : <Add />}
                        sx={{ bgcolor: '#F44336' }}
                    >
                        Add to Blacklist
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={3000}
                onClose={() => setSnackbar(p => ({ ...p, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar(p => ({ ...p, open: false }))}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

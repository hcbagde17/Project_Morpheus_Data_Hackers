import { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, TextField, Button, Switch, IconButton, Chip,
    Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions,
    Card, CardContent, Alert, Snackbar, InputAdornment, Divider,
    List, ListItem, ListItemText, ListItemSecondaryAction, CircularProgress
} from '@mui/material';
import { Add, Delete, Search, Shield, Block, CheckCircle } from '@mui/icons-material';

// Category display names and colors
const CATEGORY_CONFIG = {
    browsers: { label: 'Browsers', color: '#2196F3' },
    vpn: { label: 'VPN Services', color: '#FF5722' },
    communication: { label: 'Communication', color: '#9C27B0' },
    remote: { label: 'Remote Desktop', color: '#F44336' },
    ai: { label: 'AI Tools', color: '#E91E63' },
    recording: { label: 'Screen Recording', color: '#FF9800' },
    system: { label: 'System Tools', color: '#607D8B' },
    programming: { label: 'Programming', color: '#4CAF50' },
    utilities: { label: 'Utilities', color: '#795548' },
    custom: { label: 'Custom', color: '#00BCD4' },
};

export default function AdminBlacklistManager() {
    const [blacklistByCategory, setBlacklistByCategory] = useState({});
    const [whitelist, setWhitelist] = useState([]);
    const [customApps, setCustomApps] = useState([]);
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [newApp, setNewApp] = useState({ name: '', displayName: '', category: 'custom' });
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    // Load blacklist from Electron
    const loadBlacklist = useCallback(async () => {
        setLoading(true);
        try {
            if (window.electronAPI?.getDefaultBlacklist) {
                const categories = await window.electronAPI.getDefaultBlacklist();
                setBlacklistByCategory(categories || {});
            }
        } catch (err) {
            console.error('Failed to load blacklist:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadBlacklist();
    }, [loadBlacklist]);

    // Toggle whitelist for an app
    const toggleWhitelist = async (processName) => {
        const name = processName.toLowerCase();
        let updated;

        if (whitelist.includes(name)) {
            updated = whitelist.filter(p => p !== name);
        } else {
            updated = [...whitelist, name];
        }

        setWhitelist(updated);

        if (window.electronAPI?.setWhitelist) {
            await window.electronAPI.setWhitelist(updated);
        }

        setSnackbar({
            open: true,
            message: whitelist.includes(name)
                ? `${processName} is now BLOCKED`
                : `${processName} is now ALLOWED`,
            severity: whitelist.includes(name) ? 'warning' : 'success'
        });
    };

    // Add custom app
    const handleAddApp = async () => {
        if (!newApp.name.trim()) return;

        const processName = newApp.name.toLowerCase().endsWith('.exe')
            ? newApp.name.toLowerCase()
            : `${newApp.name.toLowerCase()}.exe`;

        if (window.electronAPI?.addToBlacklist) {
            await window.electronAPI.addToBlacklist(processName);
        }

        setCustomApps(prev => [...prev, {
            name: processName,
            displayName: newApp.displayName || newApp.name,
            category: 'custom'
        }]);

        setNewApp({ name: '', displayName: '', category: 'custom' });
        setAddDialogOpen(false);
        setSnackbar({ open: true, message: `${processName} added to blacklist`, severity: 'success' });
    };

    // Remove custom app
    const handleRemoveApp = async (processName) => {
        if (window.electronAPI?.removeFromBlacklist) {
            await window.electronAPI.removeFromBlacklist(processName);
        }

        setCustomApps(prev => prev.filter(a => a.name !== processName));
        setSnackbar({ open: true, message: `${processName} removed from blacklist`, severity: 'info' });
    };

    // Build flat list for rendering
    const getAllApps = () => {
        const apps = [];

        // Default categories
        Object.entries(blacklistByCategory).forEach(([category, processes]) => {
            processes.forEach(name => {
                apps.push({
                    name,
                    displayName: name.replace('.exe', ''),
                    category,
                    isDefault: true,
                    isWhitelisted: whitelist.includes(name.toLowerCase())
                });
            });
        });

        // Custom additions
        customApps.forEach(app => {
            apps.push({
                ...app,
                isDefault: false,
                isWhitelisted: whitelist.includes(app.name.toLowerCase())
            });
        });

        return apps;
    };

    // Filter apps
    const getFilteredApps = () => {
        let apps = getAllApps();

        // Filter by tab
        if (activeTab !== 'all') {
            apps = apps.filter(a => a.category === activeTab);
        }

        // Filter by search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            apps = apps.filter(a =>
                a.name.toLowerCase().includes(term) ||
                a.displayName.toLowerCase().includes(term)
            );
        }

        return apps;
    };

    const filteredApps = getFilteredApps();
    const allApps = getAllApps();
    const blockedCount = allApps.filter(a => !a.isWhitelisted).length;
    const allowedCount = allApps.filter(a => a.isWhitelisted).length;

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                <Shield sx={{ fontSize: 32, color: '#F44336' }} />
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        Application Blacklist Manager
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Manage which applications are blocked during exams
                    </Typography>
                </Box>
            </Box>

            {/* Stats */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <Card sx={{ flex: 1, bgcolor: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#F44336' }}>{blockedCount}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Blocked Apps</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ flex: 1, bgcolor: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#4CAF50' }}>{allowedCount}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Whitelisted</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ flex: 1, bgcolor: 'rgba(0, 188, 212, 0.1)', border: '1px solid rgba(0, 188, 212, 0.3)' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#00BCD4' }}>{customApps.length}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Custom Added</Typography>
                    </CardContent>
                </Card>
            </Box>

            {/* Search + Add */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField
                    size="small"
                    placeholder="Search applications..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start"><Search /></InputAdornment>
                        ),
                    }}
                    sx={{ flex: 1 }}
                />
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => setAddDialogOpen(true)}
                    sx={{ bgcolor: '#00BCD4' }}
                >
                    Add Custom App
                </Button>
            </Box>

            {/* Category Tabs */}
            <Tabs
                value={activeTab}
                onChange={(e, v) => setActiveTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
                <Tab label={`All (${allApps.length})`} value="all" />
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                    const count = allApps.filter(a => a.category === key).length;
                    if (count === 0) return null;
                    return <Tab key={key} label={`${cfg.label} (${count})`} value={key} />;
                })}
            </Tabs>

            {/* App List */}
            <List sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                {filteredApps.length === 0 && (
                    <ListItem>
                        <ListItemText primary="No applications found" secondary="Try a different search or category" />
                    </ListItem>
                )}

                {filteredApps.map((app, i) => (
                    <Box key={`${app.name}-${i}`}>
                        <ListItem sx={{ py: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                {app.isWhitelisted
                                    ? <CheckCircle sx={{ color: '#4CAF50', fontSize: 20 }} />
                                    : <Block sx={{ color: '#F44336', fontSize: 20 }} />
                                }
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                                {app.displayName}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                                                ({app.name})
                                            </Typography>
                                            <Chip
                                                label={CATEGORY_CONFIG[app.category]?.label || app.category}
                                                size="small"
                                                sx={{
                                                    bgcolor: CATEGORY_CONFIG[app.category]?.color + '22',
                                                    color: CATEGORY_CONFIG[app.category]?.color,
                                                    fontSize: '0.7rem',
                                                    height: 20
                                                }}
                                            />
                                        </Box>
                                    }
                                />
                            </Box>
                            <ListItemSecondaryAction sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" sx={{ color: app.isWhitelisted ? '#4CAF50' : '#F44336' }}>
                                    {app.isWhitelisted ? 'Allowed' : 'Blocked'}
                                </Typography>
                                <Switch
                                    checked={!app.isWhitelisted}
                                    onChange={() => toggleWhitelist(app.name)}
                                    size="small"
                                    sx={{
                                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#F44336' },
                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#F44336' },
                                    }}
                                />
                                {!app.isDefault && (
                                    <IconButton
                                        size="small"
                                        onClick={() => handleRemoveApp(app.name)}
                                        sx={{ color: '#F44336' }}
                                    >
                                        <Delete fontSize="small" />
                                    </IconButton>
                                )}
                            </ListItemSecondaryAction>
                        </ListItem>
                        {i < filteredApps.length - 1 && <Divider sx={{ opacity: 0.1 }} />}
                    </Box>
                ))}
            </List>

            {/* Add Custom App Dialog */}
            <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Custom Application to Blacklist</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Enter the exact process name as it appears in Task Manager
                    </Alert>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Process Name"
                        placeholder="example.exe"
                        value={newApp.name}
                        onChange={(e) => setNewApp(prev => ({ ...prev, name: e.target.value }))}
                        sx={{ mb: 2 }}
                        helperText="The .exe extension will be added automatically if not provided"
                    />
                    <TextField
                        fullWidth
                        label="Display Name (Optional)"
                        placeholder="Example App"
                        value={newApp.displayName}
                        onChange={(e) => setNewApp(prev => ({ ...prev, displayName: e.target.value }))}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleAddApp}
                        variant="contained"
                        disabled={!newApp.name.trim()}
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
                onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
            >
                <Alert severity={snackbar.severity} variant="filled">
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

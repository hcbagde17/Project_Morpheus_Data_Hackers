import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Box, Drawer, AppBar, Toolbar, Typography, List, ListItemButton,
    ListItemIcon, ListItemText, Avatar, IconButton, Divider, Chip,
    Tooltip, Menu, MenuItem,
} from '@mui/material';
import {
    Dashboard, People, School, Assignment, Assessment,
    Security, Settings, Logout, Menu as MenuIcon,
    Flag, CalendarMonth, Computer, Person, FamilyRestroom,
    AdminPanelSettings, BugReport, Storage, Visibility, AccountCircle,
    TrendingUp,
} from '@mui/icons-material';
import useAuthStore from '../store/authStore';

const DRAWER_WIDTH = 260;

// Navigation items per role
const navConfig = {
    technical: [
        { label: 'Dashboard', icon: <Dashboard />, path: '/dashboard/technical' },
        { label: 'System Metrics', icon: <Computer />, path: '/dashboard/technical' },
        { label: 'Database', icon: <Storage />, path: '/dashboard/technical' },
        { label: 'Live Monitor', icon: <Visibility />, path: '/dashboard/live-monitor' },
        { label: 'Flags', icon: <Flag />, path: '/dashboard/flags' },
        { label: 'Reports', icon: <Assessment />, path: '/dashboard/reports' },
        { label: 'PW Test', icon: <BugReport />, path: '/dashboard/pw-test' },
        { label: 'Profile', icon: <AccountCircle />, path: '/dashboard/profile' },
    ],
    admin: [
        { label: 'Dashboard', icon: <Dashboard />, path: '/dashboard/admin' },
        { label: 'Users', icon: <People />, path: '/dashboard/users' },
        { label: 'Courses', icon: <School />, path: '/dashboard/courses' },
        { label: 'Live Monitor', icon: <Visibility />, path: '/dashboard/live-monitor' },
        { label: 'Flags', icon: <Flag />, path: '/dashboard/flags' },
        { label: 'Blacklist', icon: <Security />, path: '/dashboard/blacklist' },
        { label: 'Reports', icon: <Assessment />, path: '/dashboard/reports' },
        { label: 'Profile', icon: <AccountCircle />, path: '/dashboard/profile' },
    ],
    teacher: [
        { label: 'Dashboard', icon: <Dashboard />, path: '/dashboard/teacher' },
        { label: 'My Courses', icon: <School />, path: '/dashboard/courses' },
        { label: 'Create Test', icon: <Assignment />, path: '/dashboard/tests/create' },
        { label: 'My Tests', icon: <Assignment />, path: '/dashboard/tests' },
        { label: 'Live Monitor', icon: <Visibility />, path: '/dashboard/live-monitor' },
        { label: 'Performance', icon: <TrendingUp />, path: '/dashboard/performance' },
        { label: 'Review Flags', icon: <Flag />, path: '/dashboard/flags' },
        { label: 'Reports', icon: <Assessment />, path: '/dashboard/reports' },
        { label: 'Profile', icon: <AccountCircle />, path: '/dashboard/profile' },
    ],
    student: [
        { label: 'Dashboard', icon: <Dashboard />, path: '/dashboard/student' },
        { label: 'My Courses', icon: <School />, path: '/dashboard/courses' },
        { label: 'Calendar', icon: <CalendarMonth />, path: '/dashboard/calendar' },
        { label: 'Profile', icon: <AccountCircle />, path: '/dashboard/profile' },
    ],
    parent: [
        { label: 'Dashboard', icon: <Dashboard />, path: '/dashboard/parent' },
        { label: 'Performance', icon: <Assessment />, path: '/dashboard/parent' },
        { label: 'Calendar', icon: <CalendarMonth />, path: '/dashboard/parent' },
        { label: 'Profile', icon: <AccountCircle />, path: '/dashboard/profile' },
    ],
};

const roleColors = {
    technical: '#FF4D6A',
    admin: '#6C63FF',
    teacher: '#00D9FF',
    student: '#4ECDC4',
    parent: '#FFB74D',
};

const roleLabels = {
    technical: 'Technical',
    admin: 'Admin',
    teacher: 'Teacher',
    student: 'Student',
    parent: 'Parent',
};

export default function DashboardLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuthStore();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState(null);

    if (!user) return null;

    const navItems = navConfig[user.role] || navConfig.student;

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const drawer = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Brand */}
            <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{
                    width: 40, height: 40, borderRadius: '12px',
                    background: 'linear-gradient(135deg, #6C63FF, #00D9FF)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(108, 99, 255, 0.3)',
                }}>
                    <Security sx={{ fontSize: 22, color: '#fff' }} />
                </Box>
                <Box>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                        ProctorWatch
                    </Typography>
                    <Typography variant="caption" color="text.secondary">v1.0.0</Typography>
                </Box>
            </Box>

            <Divider sx={{ mx: 2 }} />

            {/* Navigation */}
            <List sx={{ flex: 1, px: 1.5, py: 1 }}>
                {navItems.map((item) => (
                    <ListItemButton
                        key={item.label}
                        onClick={() => { navigate(item.path); setMobileOpen(false); }}
                        selected={location.pathname === item.path}
                        sx={{
                            borderRadius: 2, mb: 0.5, px: 2,
                            '&.Mui-selected': {
                                background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15), rgba(0, 217, 255, 0.08))',
                                borderLeft: '3px solid #6C63FF',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2), rgba(0, 217, 255, 0.12))',
                                },
                            },
                            '&:hover': {
                                background: 'rgba(148, 163, 184, 0.06)',
                            },
                        }}
                    >
                        <ListItemIcon sx={{
                            minWidth: 40,
                            color: location.pathname === item.path ? '#6C63FF' : 'text.secondary',
                        }}>
                            {item.icon}
                        </ListItemIcon>
                        <ListItemText
                            primary={item.label}
                            primaryTypographyProps={{
                                fontSize: '0.875rem',
                                fontWeight: location.pathname === item.path ? 600 : 400,
                            }}
                        />
                    </ListItemButton>
                ))}
            </List>

            <Divider sx={{ mx: 2 }} />

            {/* User Profile */}
            <Box sx={{ p: 2 }}>
                <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
                    borderRadius: 2, background: 'rgba(148, 163, 184, 0.04)',
                }}>
                    <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar
                            src={user.profile_photo_url}
                            sx={{ bgcolor: roleColors[user.role], width: 48, height: 48 }}
                        >
                            {(user.full_name || user.username)?.[0]?.toUpperCase()}
                        </Avatar>
                        <Box sx={{ overflow: 'hidden' }}>
                            <Typography variant="subtitle1" fontWeight={600} noWrap>
                                {user.full_name || user.username}
                            </Typography>
                            <Chip size="small" label={roleLabels[user.role]}
                                sx={{ height: 20, fontSize: '0.65rem', bgcolor: `${roleColors[user.role]}22`, color: roleColors[user.role] }} />
                        </Box>
                    </Box>
                    <Tooltip title="Logout">
                        <IconButton onClick={handleLogout} size="small">
                            <Logout fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', background: '#0A0E1A' }}>
            {/* Sidebar */}
            <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
                <Drawer
                    variant="temporary" open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
                >
                    {drawer}
                </Drawer>
                <Drawer
                    variant="permanent"
                    sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
                    open
                >
                    {drawer}
                </Drawer>
            </Box>

            {/* Main Content */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Top Bar */}
                <AppBar position="static" elevation={0} sx={{
                    background: 'transparent',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                }}>
                    <Toolbar>
                        <IconButton
                            onClick={() => setMobileOpen(true)}
                            sx={{ mr: 2, display: { md: 'none' } }}
                        >
                            <MenuIcon />
                        </IconButton>
                        <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
                            {navItems.find(i => i.path === location.pathname)?.label || 'Dashboard'}
                        </Typography>
                        <Chip
                            icon={<AdminPanelSettings sx={{ fontSize: 16 }} />}
                            label={roleLabels[user.role]}
                            size="small"
                            sx={{
                                bgcolor: `${roleColors[user.role]}15`,
                                color: roleColors[user.role],
                                border: `1px solid ${roleColors[user.role]}30`,
                                fontWeight: 600,
                            }}
                        />
                    </Toolbar>
                </AppBar>

                {/* Page Content */}
                <Box sx={{
                    flex: 1, overflow: 'auto', p: 3,
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(108, 99, 255, 0.04) 0%, transparent 70%)',
                }}>
                    {children}
                </Box>
            </Box>
        </Box>
    );
}

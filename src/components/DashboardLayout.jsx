import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Box, Drawer, AppBar, Toolbar, Typography, List, ListItemButton,
    ListItemIcon, ListItemText, Avatar, IconButton, Divider, Chip,
    Tooltip, useTheme,
} from '@mui/material';
import {
    Dashboard, People, School, Assignment, Assessment,
    Security, Logout, Menu as MenuIcon,
    Flag, CalendarMonth, Computer, Person, FamilyRestroom,
    AdminPanelSettings, BugReport, Storage, Visibility, AccountCircle,
    TrendingUp, ChevronLeft, ChevronRight,
    Brightness4, Brightness7,
} from '@mui/icons-material';
import useAuthStore from '../store/authStore';
import { useThemeMode } from '../ThemeContext';

const DRAWER_WIDTH = 260;
const COLLAPSED_WIDTH = 72;

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
    const muiTheme = useTheme();
    const { mode, toggleMode } = useThemeMode();
    const { user, logout } = useAuthStore();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    if (!user) return null;

    const navItems = navConfig[user.role] || navConfig.student;
    const currentWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const drawer = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Brand */}
            <Box sx={{
                p: collapsed ? 1.5 : 2.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                justifyContent: collapsed ? 'center' : 'flex-start',
                minHeight: 64,
            }}>
                <Box sx={{
                    width: 40, height: 40, borderRadius: '12px', flexShrink: 0,
                    background: 'linear-gradient(135deg, #6C63FF, #00D9FF)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(108, 99, 255, 0.3)',
                }}>
                    <Security sx={{ fontSize: 22, color: '#fff' }} />
                </Box>
                {!collapsed && (
                    <Box sx={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                            ProctorWatch
                        </Typography>
                        <Typography variant="caption" color="text.secondary">v1.0.0</Typography>
                    </Box>
                )}
            </Box>

            <Divider sx={{ mx: collapsed ? 1 : 2 }} />

            {/* Navigation */}
            <List sx={{ flex: 1, px: collapsed ? 0.75 : 1.5, py: 1, overflowY: 'auto' }}>
                {navItems.map((item) => (
                    <Tooltip key={item.label} title={collapsed ? item.label : ''} placement="right" arrow>
                        <ListItemButton
                            onClick={() => { navigate(item.path); setMobileOpen(false); }}
                            selected={location.pathname === item.path}
                            sx={{
                                borderRadius: 2, mb: 0.5,
                                px: collapsed ? 1.5 : 2,
                                justifyContent: collapsed ? 'center' : 'flex-start',
                                minHeight: 44,
                                '&.Mui-selected': {
                                    background: `linear-gradient(135deg, ${muiTheme.palette.primary.main}22, ${muiTheme.palette.secondary.main}14)`,
                                    borderLeft: collapsed ? 'none' : `3px solid ${muiTheme.palette.primary.main}`,
                                    '&:hover': {
                                        background: `linear-gradient(135deg, ${muiTheme.palette.primary.main}33, ${muiTheme.palette.secondary.main}1A)`,
                                    },
                                },
                                '&:hover': {
                                    background: muiTheme.palette.action.hover,
                                },
                            }}
                        >
                            <ListItemIcon sx={{
                                minWidth: collapsed ? 0 : 40,
                                justifyContent: 'center',
                                color: location.pathname === item.path ? muiTheme.palette.primary.main : 'text.secondary',
                            }}>
                                {item.icon}
                            </ListItemIcon>
                            {!collapsed && (
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{
                                        fontSize: '0.875rem',
                                        fontWeight: location.pathname === item.path ? 600 : 400,
                                        noWrap: true,
                                    }}
                                />
                            )}
                        </ListItemButton>
                    </Tooltip>
                ))}
            </List>

            <Divider sx={{ mx: collapsed ? 1 : 2 }} />

            {/* User Profile */}
            {!collapsed ? (
                <Box sx={{ p: 2 }}>
                    <Box sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
                        borderRadius: 2, background: muiTheme.palette.action.hover,
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
                            <Avatar
                                src={user.profile_photo_url}
                                sx={{ bgcolor: roleColors[user.role], width: 40, height: 40, flexShrink: 0 }}
                            >
                                {(user.full_name || user.username)?.[0]?.toUpperCase()}
                            </Avatar>
                            <Box sx={{ overflow: 'hidden' }}>
                                <Typography variant="body2" fontWeight={600} noWrap>
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
            ) : (
                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Tooltip title={user.full_name || user.username} placement="right">
                        <Avatar
                            src={user.profile_photo_url}
                            sx={{ bgcolor: roleColors[user.role], width: 36, height: 36 }}
                        >
                            {(user.full_name || user.username)?.[0]?.toUpperCase()}
                        </Avatar>
                    </Tooltip>
                    <Tooltip title="Logout" placement="right">
                        <IconButton onClick={handleLogout} size="small">
                            <Logout fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            )}

        </Box>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
            {/* Sidebar */}
            <Box component="nav" sx={{
                width: { md: currentWidth },
                flexShrink: { md: 0 },
                transition: 'width 200ms ease',
            }}>
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
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        '& .MuiDrawer-paper': {
                            width: currentWidth,
                            transition: 'width 200ms ease',
                            overflowX: 'hidden',
                        },
                    }}
                    open
                >
                    {drawer}
                </Drawer>
            </Box>

            {/* Main Content */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Top Bar */}
                <AppBar position="static" elevation={0} color="transparent" sx={{
                    borderBottom: `1px solid ${muiTheme.palette.divider}`,
                }}>
                    <Toolbar>
                        <IconButton
                            onClick={() => setMobileOpen(true)}
                            sx={{ mr: 2, display: { md: 'none' }, color: 'text.primary' }}
                        >
                            <MenuIcon />
                        </IconButton>
                        <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                            <IconButton
                                onClick={() => setCollapsed(!collapsed)}
                                sx={{ mr: 2, display: { xs: 'none', md: 'flex' }, color: 'text.primary' }}
                            >
                                <MenuIcon />
                            </IconButton>
                        </Tooltip>
                        <Typography variant="h6" fontWeight={600} sx={{ flex: 1, color: 'text.primary' }}>
                            {navItems.find(i => i.path === location.pathname)?.label || 'Dashboard'}
                        </Typography>

                        {/* Theme Toggle */}
                        <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                            <IconButton onClick={toggleMode} sx={{ mr: 1, color: 'text.primary' }}>
                                {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
                            </IconButton>
                        </Tooltip>

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
                    background: mode === 'dark'
                        ? 'radial-gradient(ellipse at 50% 0%, rgba(108, 99, 255, 0.04) 0%, transparent 70%)'
                        : 'radial-gradient(ellipse at 50% 0%, rgba(108, 99, 255, 0.03) 0%, transparent 70%)',
                }}>
                    {children}
                </Box>
            </Box>
        </Box>
    );
}

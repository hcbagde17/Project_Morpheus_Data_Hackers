import { useState, useEffect } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Chip, LinearProgress,
    TextField, Button, Table, TableHead, TableRow, TableCell, TableBody,
    Alert, Tabs, Tab,
} from '@mui/material';
import { Storage, Memory, Speed, BugReport, Terminal, Refresh, Schema } from '@mui/icons-material';
import { supabase } from '../../lib/supabase';
import MermaidDiagram from '../../components/MermaidDiagram';

const schemaGraph = `
erDiagram
    users ||--o{ enrollments : "has"
    users ||--o{ courses : "teaches"
    users ||--o{ exam_sessions : "takes"
    users ||--o{ face_registrations : "has"
    users ||--o{ consents : "gives"
    users ||--o{ parent_student : "is_parent"
    users ||--o{ parent_student : "is_student"
    courses ||--|{ tests : "contains"
    courses ||--o{ enrollments : "has"
    tests ||--o{ test_questions : "includes"
    questions ||--o{ test_questions : "is_in"
    tests ||--o{ exam_sessions : "generates"
    exam_sessions ||--o{ answers : "contains"
    exam_sessions ||--o{ flags : "triggers"
    exam_sessions ||--o{ module_overrides : "has"
    app_blacklist }|--|| users : "blocks_or_unblocks"
    telemetry }|--|| exam_sessions : "logs"
    institutions ||--o{ courses : "owns"
`;

export default function TechnicalDashboard() {
    const [tab, setTab] = useState(0);
    const [systemInfo, setSystemInfo] = useState(null);
    const [query, setQuery] = useState('SELECT * FROM users LIMIT 10;');
    const [queryResult, setQueryResult] = useState(null);
    const [queryError, setQueryError] = useState('');
    const [tables, setTables] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            // Get system info from Electron
            if (window.electronAPI) {
                const info = await window.electronAPI.getSystemInfo();
                setSystemInfo(info);
            }
            // Get table info
            const tableNames = ['users', 'courses', 'tests', 'questions', 'exam_sessions', 'answers', 'flags', 'audit_logs', 'enrollments', 'telemetry', 'module_overrides'];
            const counts = await Promise.all(tableNames.map(t => supabase.from(t).select('id', { count: 'exact', head: true })));
            setTables(tableNames.map((name, i) => ({ name, count: counts[i].count || 0 })));
            // Recent audit logs
            const { data: logs } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(20);
            setAuditLogs(logs || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const runQuery = async () => {
        setQueryError('');
        setQueryResult(null);
        try {
            // Extract table name from query for safety
            const match = query.match(/from\s+(\w+)/i);
            if (!match) { setQueryError('Could not parse table name'); return; }
            const tableName = match[1];
            const isSelect = query.trim().toLowerCase().startsWith('select');
            if (!isSelect) { setQueryError('Only SELECT queries are allowed'); return; }
            const { data, error } = await supabase.from(tableName).select('*').limit(50);
            if (error) throw error;
            setQueryResult(data);
        } catch (err) { setQueryError(err.message); }
    };

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight={700} gutterBottom>Technical Dashboard</Typography>
                    <Typography color="text.secondary">System monitoring, database access, and debug tools</Typography>
                </Box>
            </Box>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab label="System Info" icon={<Memory />} iconPosition="start" />
                <Tab label="Database Query" icon={<Terminal />} iconPosition="start" />
                <Tab label="Schema Viz" icon={<Schema />} iconPosition="start" />
                <Tab label="Audit Logs" icon={<Storage />} iconPosition="start" />
            </Tabs>

            {/* System Info */}
            {tab === 0 && (
                <Grid container spacing={3}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}><Card><CardContent sx={{ p: 3, textAlign: 'center' }}>
                        <Memory sx={{ fontSize: 36, color: '#6C63FF', mb: 1 }} />
                        <Typography variant="h5" fontWeight={700}>{systemInfo?.cpus || '—'}</Typography>
                        <Typography variant="body2" color="text.secondary">CPU Cores</Typography>
                    </CardContent></Card></Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}><Card><CardContent sx={{ p: 3, textAlign: 'center' }}>
                        <Speed sx={{ fontSize: 36, color: '#00D9FF', mb: 1 }} />
                        <Typography variant="h5" fontWeight={700}>{systemInfo?.totalMemory || '—'} GB</Typography>
                        <Typography variant="body2" color="text.secondary">Total RAM</Typography>
                    </CardContent></Card></Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}><Card><CardContent sx={{ p: 3, textAlign: 'center' }}>
                        <Storage sx={{ fontSize: 36, color: '#4ECDC4', mb: 1 }} />
                        <Typography variant="h5" fontWeight={700}>{systemInfo?.freeMemory || '—'} GB</Typography>
                        <Typography variant="body2" color="text.secondary">Free RAM</Typography>
                    </CardContent></Card></Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}><Card><CardContent sx={{ p: 3, textAlign: 'center' }}>
                        <BugReport sx={{ fontSize: 36, color: '#FFB74D', mb: 1 }} />
                        <Typography variant="h5" fontWeight={700}>{systemInfo?.platform || '—'}</Typography>
                        <Typography variant="body2" color="text.secondary">Platform</Typography>
                    </CardContent></Card></Grid>
                    <Grid size={12}><Card><CardContent sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} gutterBottom>Database Tables</Typography>
                        <Table size="small"><TableHead><TableRow>
                            <TableCell>Table</TableCell><TableCell align="right">Rows</TableCell>
                        </TableRow></TableHead><TableBody>
                                {tables.map(t => (
                                    <TableRow key={t.name}><TableCell>{t.name}</TableCell><TableCell align="right"><Chip label={t.count} size="small" /></TableCell></TableRow>
                                ))}
                            </TableBody></Table>
                    </CardContent></Card></Grid>
                </Grid>
            )
            }

            {/* Database Query */}
            {
                tab === 1 && (
                    <Card><CardContent sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} gutterBottom>SQL Query (Read-Only)</Typography>
                        <TextField fullWidth multiline rows={3} value={query} onChange={e => setQuery(e.target.value)}
                            sx={{ mb: 2, '& .MuiInputBase-input': { fontFamily: 'monospace' } }} />
                        <Button variant="contained" onClick={runQuery} startIcon={<Terminal />} sx={{ mb: 2 }}>Execute</Button>
                        {queryError && <Alert severity="error" sx={{ mb: 2 }}>{queryError}</Alert>}
                        {queryResult && (
                            <Box sx={{ overflowX: 'auto' }}>
                                <Table size="small"><TableHead><TableRow>
                                    {Object.keys(queryResult[0] || {}).map(k => <TableCell key={k}>{k}</TableCell>)}
                                </TableRow></TableHead><TableBody>
                                        {queryResult.map((row, i) => (
                                            <TableRow key={i}>{Object.values(row).map((v, j) => (
                                                <TableCell key={j} sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
                                                </TableCell>
                                            ))}</TableRow>
                                        ))}
                                    </TableBody></Table>
                            </Box>
                        )}
                    </CardContent></Card>
                )
            }

            {/* Schema Visualization */}
            {
                tab === 2 && (
                    <Card><CardContent sx={{ p: 3, overflowX: 'auto' }}>
                        <Typography variant="h6" fontWeight={600} gutterBottom>Database Schema</Typography>
                        <MermaidDiagram chart={schemaGraph} />
                    </CardContent></Card>
                )
            }

            {/* Audit Logs */}
            {
                tab === 3 && (
                    <Card><CardContent sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6" fontWeight={600}>Audit Logs</Typography>
                            <Button size="small" startIcon={<Refresh />} onClick={loadData}>Refresh</Button>
                        </Box>
                        <Table size="small"><TableHead><TableRow>
                            <TableCell>Action</TableCell><TableCell>User ID</TableCell><TableCell>Details</TableCell><TableCell>Timestamp</TableCell>
                        </TableRow></TableHead><TableBody>
                                {auditLogs.map(log => (
                                    <TableRow key={log.id}><TableCell><Chip label={log.action} size="small" /></TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{log.user_id?.slice(0, 8)}</TableCell>
                                        <TableCell sx={{ maxWidth: 250 }}>{JSON.stringify(log.details)}</TableCell>
                                        <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell></TableRow>
                                ))}
                                {auditLogs.length === 0 && <TableRow><TableCell colSpan={4} align="center">No logs</TableCell></TableRow>}
                            </TableBody></Table>
                    </CardContent></Card>
                )
            }
        </Box >
    );
}

import { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Grid, LinearProgress,
    Button, TextField, MenuItem, Chip,
} from '@mui/material';
import { Download, Assessment, BarChart as BarChartIcon, PieChartOutline } from '@mui/icons-material';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
    ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/authStore';

const COLORS = ['#6C63FF', '#4ECDC4', '#FF4D6A', '#FFB74D', '#00D9FF', '#A78BFA'];

export default function Reports() {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [courseFilter, setCourseFilter] = useState('all');
    const [testFilter, setTestFilter] = useState('all');
    const [courses, setCourses] = useState([]);
    const [tests, setTests] = useState([]);

    // Chart data
    const [scoreDistribution, setScoreDistribution] = useState([]);
    const [flagBreakdown, setFlagBreakdown] = useState([]);
    const [courseStats, setCourseStats] = useState([]);
    const [trendData, setTrendData] = useState([]);

    useEffect(() => { loadReports(); }, [courseFilter, testFilter]);

    const loadReports = async () => {
        setLoading(true);
        try {
            const isTeacher = user?.role === 'teacher';

            // Courses
            let crsQuery = supabase.from('courses').select('id, name, code').eq('is_active', true);
            if (isTeacher) crsQuery = crsQuery.eq('teacher_id', user.id);
            const { data: crs } = await crsQuery;
            setCourses(crs || []);

            // Tests
            let testQuery = supabase.from('tests').select('id, title, course_id');
            if (isTeacher && crs?.length > 0) {
                testQuery = testQuery.in('course_id', crs.map(c => c.id));
            } else if (isTeacher && (!crs || crs.length === 0)) {
                setTests([]);
                setScoreDistribution([]);
                setFlagBreakdown([]);
                setCourseStats([]);
                setTrendData([]);
                setLoading(false);
                return;
            }
            const { data: tData } = await testQuery;
            setTests(tData || []);

            // All completed sessions
            let sessQuery = supabase
                .from('exam_sessions')
                .select('*, tests!inner(title, total_marks, course_id, courses(name))')
                .in('status', ['submitted', 'completed']);

            if (isTeacher) {
                sessQuery = sessQuery.in('tests.course_id', crs.map(c => c.id));
            }

            if (testFilter !== 'all') {
                sessQuery = sessQuery.eq('test_id', testFilter);
            } else if (courseFilter !== 'all') {
                sessQuery = sessQuery.eq('tests.course_id', courseFilter);
            }

            const { data: sessions } = await sessQuery;
            const allSessions = sessions || [];

            // 1. Score Distribution
            const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
            allSessions.forEach(s => {
                const pct = Math.round(((s.score || 0) / (s.tests?.total_marks || 1)) * 100);
                if (pct <= 20) buckets['0-20']++;
                else if (pct <= 40) buckets['21-40']++;
                else if (pct <= 60) buckets['41-60']++;
                else if (pct <= 80) buckets['61-80']++;
                else buckets['81-100']++;
            });
            setScoreDistribution(Object.entries(buckets).map(([range, count]) => ({ range, count })));

            // 2. Flag Breakdown
            let flags = [];
            if (allSessions.length > 0) {
                const sessionIds = allSessions.map(s => s.id);
                const { data: fData } = await supabase.from('flags').select('severity, module').in('session_id', sessionIds);
                flags = fData || [];
            }

            const moduleMap = {};
            flags.forEach(f => {
                const mod = f.module || 'Unknown';
                if (!moduleMap[mod]) moduleMap[mod] = { red: 0, orange: 0 };
                if (f.severity === 'RED') moduleMap[mod].red++;
                else moduleMap[mod].orange++;
            });
            setFlagBreakdown(Object.entries(moduleMap).map(([name, v]) => ({ name, ...v, total: v.red + v.orange })));

            // 3. Course-wise Stats
            const courseMap = {};
            allSessions.forEach(s => {
                const name = s.tests?.courses?.name || 'Unknown';
                if (!courseMap[name]) courseMap[name] = { exams: 0, totalPct: 0, flags: 0 };
                courseMap[name].exams++;
                courseMap[name].totalPct += ((s.score || 0) / (s.tests?.total_marks || 1)) * 100;
                courseMap[name].flags += (s.red_flags || 0) + (s.orange_flags || 0);
            });
            setCourseStats(Object.entries(courseMap).map(([name, v]) => ({
                name: name.length > 15 ? name.slice(0, 15) + '…' : name,
                avgScore: Math.round(v.totalPct / v.exams),
                exams: v.exams,
                flags: v.flags,
            })));

            // 4. Trend over time (last 30 days)
            const now = new Date();
            const thirtyDaysAgo = new Date(now - 30 * 86400000);
            const byDate = {};
            allSessions.filter(s => new Date(s.ended_at) >= thirtyDaysAgo).forEach(s => {
                const day = new Date(s.ended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (!byDate[day]) byDate[day] = { exams: 0, totalPct: 0 };
                byDate[day].exams++;
                byDate[day].totalPct += ((s.score || 0) / (s.tests?.total_marks || 1)) * 100;
            });
            setTrendData(Object.entries(byDate).map(([day, v]) => ({
                day, exams: v.exams, avgScore: Math.round(v.totalPct / v.exams),
            })));
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const exportCSV = () => {
        let csv = 'Course,Exams Taken,Avg Score %,Total Flags\n';
        courseStats.forEach(c => { csv += `${c.name},${c.exams},${c.avgScore},${c.flags}\n`; });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `proctorwatch_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Reports & Analytics</Typography>
                    <Typography color="text.secondary">Performance and proctoring analytics</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField select size="small" label="Course Filter" value={courseFilter}
                        onChange={e => { setCourseFilter(e.target.value); setTestFilter('all'); }}
                        sx={{ minWidth: 200 }}>
                        <MenuItem value="all">All Courses</MenuItem>
                        {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                    </TextField>

                    <TextField select size="small" label="Test Filter" value={testFilter}
                        onChange={e => setTestFilter(e.target.value)}
                        sx={{ minWidth: 200 }}>
                        <MenuItem value="all">All Tests</MenuItem>
                        {tests.filter(t => courseFilter === 'all' || t.course_id === courseFilter).map(t =>
                            <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>
                        )}
                    </TextField>
                    <Button variant="outlined" startIcon={<Download />} onClick={exportCSV}>Export CSV</Button>
                </Box>
            </Box>

            {/* Score Distribution & Flag Breakdown */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <Card><CardContent sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                            <BarChartIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#6C63FF' }} />
                            Score Distribution
                        </Typography>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={scoreDistribution}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                                <XAxis dataKey="range" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                                <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} />
                                <RTooltip contentStyle={{ background: '#0F1629', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }} />
                                <Bar dataKey="count" fill="#6C63FF" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent></Card>
                </Grid>

                <Grid size={{ xs: 12, md: 5 }}>
                    <Card><CardContent sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                            <PieChartOutline sx={{ mr: 1, verticalAlign: 'middle', color: '#FF4D6A' }} />
                            Flags by Module
                        </Typography>
                        {flagBreakdown.length > 0 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={flagBreakdown} dataKey="total" nameKey="name" cx="50%" cy="50%"
                                        outerRadius={90} innerRadius={45} paddingAngle={3} label={({ name, total }) => `${name}: ${total}`}>
                                        {flagBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <RTooltip contentStyle={{ background: '#0F1629', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 8 }}>
                                <Typography color="text.secondary">No flag data available</Typography>
                            </Box>
                        )}
                    </CardContent></Card>
                </Grid>
            </Grid>

            {/* Course Stats & Trend */}
            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Card><CardContent sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                            <Assessment sx={{ mr: 1, verticalAlign: 'middle', color: '#4ECDC4' }} />
                            Course-wise Performance
                        </Typography>
                        {courseStats.length > 0 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={courseStats} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                                    <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 12 }} domain={[0, 100]} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} width={100} />
                                    <RTooltip contentStyle={{ background: '#0F1629', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }} />
                                    <Bar dataKey="avgScore" fill="#4ECDC4" radius={[0, 6, 6, 0]} name="Avg %" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 8 }}><Typography color="text.secondary">No course data</Typography></Box>
                        )}
                    </CardContent></Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <Card><CardContent sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                            <BarChartIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#00D9FF' }} />
                            30-Day Exam Trend
                        </Typography>
                        {trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                                    <XAxis dataKey="day" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                                    <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} />
                                    <RTooltip contentStyle={{ background: '#0F1629', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }} />
                                    <Legend />
                                    <Line type="monotone" dataKey="avgScore" stroke="#6C63FF" strokeWidth={2} dot={{ fill: '#6C63FF' }} name="Avg %" />
                                    <Line type="monotone" dataKey="exams" stroke="#00D9FF" strokeWidth={2} dot={{ fill: '#00D9FF' }} name="Exams" />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 8 }}><Typography color="text.secondary">No recent data</Typography></Box>
                        )}
                    </CardContent></Card>
                </Grid>
            </Grid>
        </Box>
    );
}

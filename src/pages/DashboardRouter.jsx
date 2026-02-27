import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

// Dashboard Components
import DashboardLayout from '../components/DashboardLayout';
import AdminDashboard from './dashboards/AdminDashboard';
import TeacherDashboard from './dashboards/TeacherDashboard';
import StudentDashboard from './dashboards/StudentDashboard';
import ParentDashboard from './dashboards/ParentDashboard';
import TechnicalDashboard from './dashboards/TechnicalDashboard';
import StudentCalendar from './StudentCalendar';

// Shared pages
import CourseManagement from './CourseManagement';
import UserManagement from './UserManagement';
import TestCreation from './TestCreation';
import TestList from './TestList';
import ExamSession from './ExamSession';
import FlagReview from './FlagReview';
import Reports from './Reports';
import ProfileSettings from './ProfileSettings';
import LiveSessionMonitor from './LiveSessionMonitor';
import StudentPerformance from './StudentPerformance';
import FaceRegistration from './FaceRegistration';
import TestResults from './TestResults';
import StudentTestResult from './StudentTestResult';
import AdminBlacklistManager from '../components/AdminBlacklistManager';
import PWTestSession from './PWTestSession';

const roleDashboardMap = {
    admin: '/dashboard/admin',
    teacher: '/dashboard/teacher',
    student: '/dashboard/student',
    parent: '/dashboard/parent',
    technical: '/dashboard/technical',
};

export default function DashboardRouter() {
    const { user } = useAuthStore();

    if (!user) return <Navigate to="/login" replace />;

    const defaultPath = roleDashboardMap[user.role] || '/dashboard/student';

    return (
        <DashboardLayout>
            <Routes>
                {/* Role-specific home dashboards */}
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="teacher" element={<TeacherDashboard />} />
                <Route path="student" element={<StudentDashboard />} />
                <Route path="parent" element={<ParentDashboard />} />
                <Route path="technical" element={<TechnicalDashboard />} />

                {/* Shared Feature Pages */}
                <Route path="courses" element={<CourseManagement />} />
                <Route path="users" element={<UserManagement />} />
                <Route path="tests/create" element={<TestCreation />} />
                <Route path="tests" element={<TestList />} />
                <Route path="exam/:testId" element={<ExamSession />} />
                <Route path="flags" element={<FlagReview />} />
                <Route path="reports" element={<Reports />} />
                <Route path="profile" element={<ProfileSettings />} />
                <Route path="live-monitor" element={<LiveSessionMonitor />} />
                <Route path="live-monitor" element={<LiveSessionMonitor />} />
                <Route path="performance" element={<StudentPerformance />} />
                <Route path="calendar" element={<StudentCalendar />} />
                <Route path="face-registration" element={<FaceRegistration />} />
                <Route path="test-results/:testId" element={<TestResults />} />
                <Route path="results/:sessionId" element={<StudentTestResult />} />
                <Route path="blacklist" element={<AdminBlacklistManager />} />
                <Route path="pw-test" element={<PWTestSession />} />

                {/* Default redirect based on role */}
                <Route path="" element={<Navigate to={defaultPath} replace />} />
                <Route path="*" element={<Navigate to={defaultPath} replace />} />
            </Routes>
        </DashboardLayout>
    );
}

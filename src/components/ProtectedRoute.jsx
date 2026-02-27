import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function ProtectedRoute({ children }) {
    const { user } = useAuthStore();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // If first login, redirect to first-login page
    if (user.first_login && window.location.pathname !== '/first-login') {
        return <Navigate to="/first-login" replace />;
    }

    return children;
}

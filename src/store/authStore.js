import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// Simple SHA-256 hash for password verification (MVP)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const useAuthStore = create((set, get) => ({
    user: null,
    session: null,
    loading: true,
    error: null,

    // Initialize auth state
    initialize: async () => {
        try {
            // Check for stored session
            const stored = localStorage.getItem('pw_session');
            if (stored) {
                const session = JSON.parse(stored);
                set({ user: session.user, session, loading: false });
            } else {
                set({ loading: false });
            }
        } catch (err) {
            set({ loading: false, error: err.message });
        }
    },

    // Login with username + password
    login: async (username, password) => {
        set({ loading: true, error: null });
        try {
            const passwordHash = await hashPassword(password);

            // Query user from database
            const { data: users, error } = await supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .eq('is_active', true)
                .limit(1);

            if (error) throw error;
            if (!users || users.length === 0) {
                throw new Error('Invalid username or password');
            }

            const user = users[0];

            // Verify password (compare hashes)
            if (user.password_hash !== passwordHash) {
                throw new Error('Invalid username or password');
            }

            // Create session
            const session = {
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role,
                    phone: user.phone,
                    profile_photo_url: user.profile_photo_url,
                    first_login: user.first_login,
                },
                token: btoa(JSON.stringify({ id: user.id, role: user.role, ts: Date.now() })),
            };

            localStorage.setItem('pw_session', JSON.stringify(session));

            // Log audit
            await supabase.from('audit_logs').insert({
                action: 'LOGIN',
                user_id: user.id,
                details: { username, role: user.role },
            });

            set({ user: session.user, session, loading: false });
            return session;
        } catch (err) {
            set({ loading: false, error: err.message });
            throw err;
        }
    },

    // Logout
    logout: async () => {
        const { user } = get();
        if (user) {
            await supabase.from('audit_logs').insert({
                action: 'LOGOUT',
                user_id: user.id,
                details: { username: user.username },
            });
        }
        localStorage.removeItem('pw_session');
        set({ user: null, session: null, error: null });
    },

    // Change password
    changePassword: async (currentPassword, newPassword) => {
        const { user } = get();
        if (!user) throw new Error('Not logged in');

        const currentHash = await hashPassword(currentPassword);
        const newHash = await hashPassword(newPassword);

        // Verify current password
        const { data: users } = await supabase
            .from('users')
            .select('password_hash')
            .eq('id', user.id)
            .limit(1);

        if (!users || users[0].password_hash !== currentHash) {
            throw new Error('Current password is incorrect');
        }

        // Update password
        const { error } = await supabase
            .from('users')
            .update({ password_hash: newHash, first_login: false, updated_at: new Date().toISOString() })
            .eq('id', user.id);

        if (error) throw error;

        // Update local state
        set({ user: { ...user, first_login: false } });
        const stored = JSON.parse(localStorage.getItem('pw_session'));
        stored.user.first_login = false;
        localStorage.setItem('pw_session', JSON.stringify(stored));

        // Audit log
        await supabase.from('audit_logs').insert({
            action: 'PASSWORD_CHANGE',
            user_id: user.id,
            details: { first_login_change: true },
        });
    },

    // Verify admin credentials (for override panel)
    verifyAdmin: async (username, password) => {
        const passwordHash = await hashPassword(password);
        const { data: users } = await supabase
            .from('users')
            .select('id, role')
            .eq('username', username)
            .eq('is_active', true)
            .in('role', ['admin', 'technical'])
            .limit(1);

        if (!users || users.length === 0) return null;
        if (users[0] && users.length > 0) {
            // In MVP, we check hash directly. For verification during exam:
            const { data: fullUser } = await supabase
                .from('users')
                .select('password_hash')
                .eq('id', users[0].id)
                .limit(1);

            if (fullUser && fullUser[0].password_hash === passwordHash) {
                return users[0];
            }
        }
        return null;
    },

    clearError: () => set({ error: null }),
}));

export default useAuthStore;

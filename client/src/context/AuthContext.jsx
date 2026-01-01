import { createContext, useState, useEffect, useContext } from 'react';
import LoadingScreen from '../components/LoadingScreen';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            // Validate token and fetch user
            fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Invalid token');
            })
            .then(data => {
                setUser(data.user);
                // Artificial delay to show the nice loading screen if it was too fast?
                // Or just let it be natural. User mentioned "loading bar completes".
                // Our LoadingScreen simulates progress.
                // Let's settle for at least 800ms to avoid flicker?
                // But generally users want speed. Let's just set loading false.
                setLoading(false);
            })
            .catch(() => {
                logout();
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = (newToken, newUser) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(newUser);
    };

    const updateUser = (updates) => {
        setUser(prev => ({ ...prev, ...updates }));
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    // [FIX] Don't show loading screen if app lock is enabled - lock screen takes priority
    // Check localStorage directly since AppLockContext is mounted after AuthContext
    const hasAppLock = !!localStorage.getItem('app_passcode');
    
    if (loading) {
        // If app lock is enabled, render nothing here - the lock screen will handle UI
        if (hasAppLock) {
            return null;
        }
        return <LoadingScreen />;
    }

    return (
        <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

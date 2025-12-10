import { createContext, useState, useEffect, useContext } from 'react';

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

    return (
        <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

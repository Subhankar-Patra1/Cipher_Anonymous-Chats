import { createContext, useState, useEffect, useContext } from 'react';
import LoadingScreen from '../components/LoadingScreen';
import { cryptoManager } from '../lib/crypto/CryptoManager';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    const initializeCrypto = async (authToken) => {
        try {
            console.log('[Auth] Initializing Crypto Manager...');
            const newIdentity = await cryptoManager.init();
            
            // [CRITICAL FIX] Always register/update device with server
            // Previously we only registered NEW identities, but if a device exists
            // locally but isn't in the server DB, it would never get registered
            const deviceId = cryptoManager.deviceId;
            const publicKey = await cryptoManager.getPublicKey();
            const signingPublicKey = await cryptoManager.getSigningPublicKey();
            
            if (deviceId && publicKey) {
                console.log('[Auth] Registering/updating device identity...', deviceId);
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/device`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ deviceId, publicKey, signingPublicKey })
                });
                console.log('[Auth] Device registration response:', res.status);
            } else {
                console.error('[Auth] Missing device info for registration');
            }
        } catch (e) {
            console.error('[Auth] Crypto init failed', e);
        }
    };

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
            .then(async data => {
                setUser(data.user);
                // Initialize crypto in background after user load
                await initializeCrypto(token);
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

    const login = async (newToken, newUser) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(newUser);
        await initializeCrypto(newToken);
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

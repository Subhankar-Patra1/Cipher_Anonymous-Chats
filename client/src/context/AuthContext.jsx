import { createContext, useState, useEffect, useContext } from 'react';
import LoadingScreen from '../components/LoadingScreen';
import { cryptoManager } from '../lib/crypto/CryptoManager';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // [OPTIMIZATION] Prefetch crypto identity on mount so it's ready for login
    useEffect(() => {
        const prewarmCrypto = async () => {
             try {
                 // Initializes if needed, or loads existing
                 await cryptoManager.init(); 
             } catch (e) {
                 console.error('[Auth] Crypto prewarm failed', e);
             }
        };
        prewarmCrypto();
    }, []);

    const initializeCrypto = async (authToken) => {
        try {
            console.log('[Auth] Verifying Crypto Identity...');
            // Ensure init is done (should be fast if prewarmed)
            await cryptoManager.init();
            
            // [FIX] Get device info from cryptoManager after init
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

    const login = async (newToken, newUser, isNew = false) => {
        // [NOTE] This function is called AFTER the API request returns.
        // The optimization happens in the *caller* of this function (the UI component),
        // or we need to change how login is exposed if `login` itself performed the fetch.
        // Wait, looking at the code, `login` just sets state. The API call is done in Login.jsx.
        // We need to check where `fetch('/api/auth/login')` is called.
        
        setLoading(true); 
        if (isNew) {
            localStorage.setItem('skipped_sync', 'true');
        }
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(newUser);
        
        // [OPTIMIZATION] We assume keys were bundled in the login request.
        // But strictly speaking, we should ensure crypto manager has the token for future auto-backups.
        try {
            // Just ensure it's initialized locally
            await cryptoManager.init(); 
        } catch (err) {
            console.error('[Auth] Crypto init error:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateUser = (updates) => {
        setUser(prev => ({ ...prev, ...updates }));
    };

    const logout = () => {
        // [FIX] Clear all app lock preferences on logout
        localStorage.removeItem('token');
        localStorage.removeItem('app_passcode');
        localStorage.removeItem('app_lock_enabled');
        localStorage.removeItem('auto_lock_duration');
        localStorage.removeItem('skipped_sync'); // Clear sync skip flag too
        
        setToken(null);
        setUser(null);
        
        // Force reload to reset AppLockContext state since it initializes from localStorage
        // This is safer than trying to expose a reset method from AppLockContext
        window.location.reload();
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

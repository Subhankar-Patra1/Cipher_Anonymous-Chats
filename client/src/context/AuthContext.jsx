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
        // [OPTIMIZATION] Skip fetch if user is already populated (happens immediately after login)
        if (token && !user) {
            // [FIX] Add timeout and proper error handling to prevent infinite loading
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal
            })
            .then(res => {
                clearTimeout(timeoutId);
                if (res.ok) return res.json();
                // [FIX] Only throw for actual auth failures (401/403), not network issues
                if (res.status === 401 || res.status === 403) {
                    throw new Error('AUTH_INVALID');
                }
                throw new Error('SERVER_ERROR');
            })
            .then(async data => {
                setUser(data.user);
                // Initialize crypto in background after user load
                initializeCrypto(token).catch(e => console.warn('[Auth] Crypto init warning:', e));
                setLoading(false);
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                // [FIX] Only logout on actual auth failures, not network/timeout errors
                if (error.message === 'AUTH_INVALID') {
                    console.warn('[Auth] Token invalid, logging out');
                    logout();
                } else {
                    // Network error or timeout - keep the token, user might still be valid
                    console.warn('[Auth] Session validation failed (network/timeout):', error.message);
                    // Try to use cached user data if available, otherwise clear loading
                    // The app will retry on next interaction
                }
                setLoading(false);
            });

            return () => {
                clearTimeout(timeoutId);
                controller.abort();
            };
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
            // [FIX] No longer setting 'skipped_sync' for new users.
            // New users start fresh, so "Restore" option shouldn't be forced on them.
            localStorage.setItem('is_fresh_signup', 'true'); // [NEW] Flag to prevent restore modal on dashboard
            localStorage.setItem('history_synced', 'true'); // [NEW] Persist "synced" state so refresh doesn't trigger modal
        }
        localStorage.setItem('token', newToken);
        localStorage.setItem('is_new_login', 'true'); // [NEW] Mark session as a fresh login
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

    const logout = async () => {
        // [FIX] Clear all app lock preferences on logout
        localStorage.removeItem('token');
        localStorage.removeItem('app_passcode');
        localStorage.removeItem('app_lock_enabled');
        localStorage.removeItem('auto_lock_duration');
        localStorage.removeItem('skipped_sync'); // Clear sync skip flag too
        localStorage.removeItem('history_synced'); // [NEW] Clear history sync flag
        localStorage.removeItem('is_new_login'); // [NEW] Clear new login flag
        
        // [FIX] Securely wipe all E2EE data (keys, device identity)
        await cryptoManager.clearAllData();
        
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

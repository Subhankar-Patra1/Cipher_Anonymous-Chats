import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import SpinLoading from '../components/SpinLoading';
import OAuthButtons from '../components/OAuthButtons';
import { QRCodeSVG } from 'qrcode.react';
import CipherQRCode from '../components/CipherQR';
import { cryptoManager } from '../lib/crypto/CryptoManager';
import db from '../utils/db';

import { io as socketIO } from 'socket.io-client';

// [NEW] QR Login Panel Component
const QRLoginPanel = ({ onSuccess }) => {
    const [qrToken, setQrToken] = useState(null);
    const [expiresAt, setExpiresAt] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [qrStatus, setQrStatus] = useState('loading'); // loading | ready | expired | authenticated | error
    const [qrError, setQrError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const socketRef = useRef(null);
    const pollRef = useRef(null);
    const timerRef = useRef(null);

    const generateQRSession = useCallback(async () => {
        setQrStatus('loading');
        setQrError(null);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/qr-session`, {
                method: 'POST'
            });
            if (!res.ok) throw new Error('Failed to create QR session');
            const data = await res.json();
            setQrToken(data.token);
            setExpiresAt(new Date(data.expiresAt));
            setQrStatus('ready');
            return data.token;
        } catch (err) {
            console.error('[QR] Error generating session:', err);
            setQrError('Failed to generate QR code. Check your connection.');
            setQrStatus('error');
            return null;
        }
    }, []);

    // Connect to /qr namespace and subscribe
    useEffect(() => {
        let currentToken = null;

        const init = async () => {
            const token = await generateQRSession();
            if (!token) return;
            currentToken = token;

            // Connect to /qr namespace (no auth needed)
            const socket = socketIO(`${import.meta.env.VITE_API_URL}/qr`, {
                transports: ['websocket', 'polling']
            });
            socketRef.current = socket;

            socket.on('connect', () => {
                socket.emit('qr:subscribe', { token });
            });

            socket.on('qr:authenticated', (data) => {
                setQrStatus('authenticated');
                // Clean up
                if (pollRef.current) clearInterval(pollRef.current);
                if (timerRef.current) clearInterval(timerRef.current);
                // Small delay for visual feedback
                setTimeout(() => {
                    onSuccess(data.authToken, data.user);
                }, 800);
            });

            // Fallback polling every 3 seconds in case WebSocket fails
            pollRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/qr-session/${currentToken}/status`);
                    if (!statusRes.ok) {
                        if (statusRes.status === 404 || statusRes.status === 410) {
                            setQrStatus('expired');
                            clearInterval(pollRef.current);
                            if (timerRef.current) clearInterval(timerRef.current);
                        }
                        return;
                    }
                    const statusData = await statusRes.json();
                    if (statusData.status === 'authenticated' && statusData.authToken) {
                        setQrStatus('authenticated');
                        clearInterval(pollRef.current);
                        if (timerRef.current) clearInterval(timerRef.current);
                        setTimeout(() => {
                            onSuccess(statusData.authToken, statusData.user);
                        }, 800);
                    } else if (statusData.status === 'expired') {
                        setQrStatus('expired');
                        clearInterval(pollRef.current);
                    }
                } catch (_) {}
            }, 3000);
        };

        init();

        return () => {
            if (socketRef.current) {
                if (currentToken) socketRef.current.emit('qr:unsubscribe', { token: currentToken });
                socketRef.current.disconnect();
            }
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // Countdown timer
    useEffect(() => {
        if (!expiresAt || qrStatus !== 'ready') return;

        const updateTimer = () => {
            const remaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining <= 0) {
                setQrStatus('expired');
                if (pollRef.current) clearInterval(pollRef.current);
            }
        };

        updateTimer();
        timerRef.current = setInterval(updateTimer, 1000);
        return () => clearInterval(timerRef.current);
    }, [expiresAt, qrStatus]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        // Disconnect old socket
        if (socketRef.current) {
            if (qrToken) socketRef.current.emit('qr:unsubscribe', { token: qrToken });
            socketRef.current.disconnect();
        }
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);

        const newToken = await generateQRSession();
        setIsRefreshing(false);
        if (!newToken) return;

        // Reconnect socket with new token
        const socket = socketIO(`${import.meta.env.VITE_API_URL}/qr`, {
            transports: ['websocket', 'polling']
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('qr:subscribe', { token: newToken });
        });

        socket.on('qr:authenticated', (data) => {
            setQrStatus('authenticated');
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeout(() => onSuccess(data.authToken, data.user), 800);
        });

        // Restart polling
        pollRef.current = setInterval(async () => {
            try {
                const statusRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/qr-session/${newToken}/status`);
                if (!statusRes.ok) {
                    if (statusRes.status === 404 || statusRes.status === 410) {
                        setQrStatus('expired');
                        clearInterval(pollRef.current);
                        if (timerRef.current) clearInterval(timerRef.current);
                    }
                    return;
                }
                const statusData = await statusRes.json();
                if (statusData.status === 'authenticated' && statusData.authToken) {
                    setQrStatus('authenticated');
                    clearInterval(pollRef.current);
                    if (timerRef.current) clearInterval(timerRef.current);
                    setTimeout(() => onSuccess(statusData.authToken, statusData.user), 800);
                } else if (statusData.status === 'expired') {
                    setQrStatus('expired');
                    clearInterval(pollRef.current);
                }
            } catch (_) {}
        }, 3000);
    };

    const qrValue = qrToken ? JSON.stringify({
        type: 'cipher_qr_login',
        token: qrToken,
        server: import.meta.env.VITE_API_URL
    }) : '';

    return (
        <div className="space-y-6 min-h-[420px]">
            {/* QR Code Container */}
            <div className="flex flex-col items-center">
                <div className="relative">
                    {/* QR Code Background */}
                    <div className={`transition-all duration-500 ${
                        qrStatus === 'authenticated' ? 'scale-95' :
                        qrStatus === 'expired' ? 'opacity-40 blur-[2px]' : ''
                    }`}>
                        {qrStatus === 'loading' ? (
                            <div className="w-[280px] h-[280px] flex items-center justify-center bg-transparent">
                                <span className="material-symbols-outlined text-slate-600 dark:text-slate-500 text-4xl animate-spin">progress_activity</span>
                            </div>
                        ) : qrStatus === 'error' ? (
                            <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-3 bg-transparent">
                                <span className="material-symbols-outlined text-red-400 text-4xl">error</span>
                                <p className="text-xs text-red-400 text-center">{qrError}</p>
                            </div>
                        ) : (
                            <div className="bg-[#1c1c1e] p-4 rounded-3xl shadow-2xl shadow-black/50 flex items-center justify-center border border-white/5">
                                <CipherQRCode 
                                    value={qrValue} 
                                    size={256} 
                                    bgColor="transparent"
                                    fgColor="#ffffff"
                                />
                            </div>
                        )}
                    </div>

                    {/* Refreshing Loader Overlay */}
                    {isRefreshing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10" style={{ borderRadius: 'inherit' }}>
                            <span className="material-symbols-outlined text-violet-400 text-4xl animate-spin">progress_activity</span>
                            <p className="text-xs text-slate-400 mt-2 font-medium">Generating new QR...</p>
                        </div>
                    )}

                    {/* Expired Overlay */}
                    {qrStatus === 'expired' && !isRefreshing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <button
                                onClick={handleRefresh}
                                className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-violet-500/30 transition-all transform hover:scale-105 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-lg">refresh</span>
                                Refresh QR Code
                            </button>
                        </div>
                    )}

                    {/* Authenticated Overlay */}
                    {qrStatus === 'authenticated' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 rounded-2xl">
                            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mb-2 animate-scale-up">
                                <span className="material-symbols-outlined text-white text-3xl">check</span>
                            </div>
                            <p className="text-sm font-bold text-emerald-400">Logged In!</p>
                        </div>
                    )}
                </div>

                {/* Timer */}
                {qrStatus === 'ready' && (
                    <div className="mt-4 flex items-center gap-2">
                        <div className="relative w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                ref={(el) => {
                                    if (el && timeLeft > 0) {
                                        // Start at current percentage, then smoothly animate to 0
                                        el.style.transition = 'none';
                                        el.style.width = `${(timeLeft / 120) * 100}%`;
                                        requestAnimationFrame(() => {
                                            requestAnimationFrame(() => {
                                                el.style.transition = `width ${timeLeft}s linear`;
                                                el.style.width = '0%';
                                            });
                                        });
                                    }
                                }}
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                            />
                        </div>
                        <span className="text-xs text-slate-500 font-mono tabular-nums w-8">{timeLeft}s</span>
                    </div>
                )}
            </div>

            {/* Instructions */}
            {qrStatus !== 'authenticated' && (
                <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">How to scan</p>
                    {[
                        { icon: 'smartphone', text: 'Open Cipher on your logged-in device' },
                        { icon: 'settings', text: 'Go to Profile → Linked Devices' },
                        { icon: 'qr_code_scanner', text: 'Tap "Link New Device" and scan this QR' }
                    ].map((step, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                                <span className="text-violet-400 text-xs font-bold">{i + 1}</span>
                            </div>
                            <p className="text-xs text-slate-400">{step.text}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function Auth() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation(); // [NEW]

    

    // [Refined] Initialize directly from location state to prevent flash
    const isOAuthSuccess = location.state && location.state.view === 'oauth_success' && location.state.recoveryCode;

    const [view, setView] = useState(isOAuthSuccess ? 'setup_backup' : 'login'); 
    const [formData, setFormData] = useState({ username: '', password: '', displayName: '', recoveryCode: '', newPassword: '' });
    const [error, setError] = useState('');
    const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState(isOAuthSuccess ? location.state.recoveryCode : '');
    const [pendingLogin, setPendingLogin] = useState(isOAuthSuccess ? { 
        token: location.state.token, 
        user: location.state.user 
    } : null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [copied, setCopied] = useState(false); // [NEW] Track copy state
    const [loginTab, setLoginTab] = useState('password'); // [NEW] 'password' | 'qr'
    
    // [NEW] Rate Limiting State
    const [failedAttempts, setFailedAttempts] = useState(() => {
        const stored = localStorage.getItem('auth_failed_attempts');
        return stored ? parseInt(stored, 10) : 0;
    });
    const [lockoutUntil, setLockoutUntil] = useState(() => {
        const stored = localStorage.getItem('auth_lockout_until');
        return stored ? parseInt(stored, 10) : 0;
    });
    const [lockoutRemaining, setLockoutRemaining] = useState(0);
    
    // Backup Setup State
    const [backupPassword, setBackupPassword] = useState('');
    const [confirmBackupPassword, setConfirmBackupPassword] = useState('');
    const [backupPasswordHint, setBackupPasswordHint] = useState('');
    const [showBackupPassword, setShowBackupPassword] = useState(false);
    const [showConfirmBackupPassword, setShowConfirmBackupPassword] = useState(false);
    


    // Validation States
    const [usernameStatus, setUsernameStatus] = useState('idle'); // idle, checking, available, taken
    const [usernameError, setUsernameError] = useState(''); // Specific format error
    const [passwordValid, setPasswordValid] = useState(false);

    const [showPassword, setShowPassword] = useState(false);
    // [NEW] Track focus for username requirements visibility
    const [isUsernameFocused, setIsUsernameFocused] = useState(false);
    
    // [NEW] Rate limiting constants
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_DURATION = 30; // seconds

    // [NEW] Countdown timer effect
    useEffect(() => {
        if (lockoutUntil <= Date.now()) {
            setLockoutRemaining(0);
            return;
        }
        
        const updateRemaining = () => {
            const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
            if (remaining <= 0) {
                setLockoutRemaining(0);
                setLockoutUntil(0);
                localStorage.removeItem('auth_lockout_until');
            } else {
                setLockoutRemaining(remaining);
            }
        };
        
        updateRemaining();
        const interval = setInterval(updateRemaining, 1000);
        return () => clearInterval(interval);
    }, [lockoutUntil]);

    // Debounce Username Check
    // Debounce Username Check
    useEffect(() => {
        if (view !== 'signup' || !formData.username || formData.username === '@') {
            setUsernameStatus('idle');
            setUsernameError('');
            return;
        }

        // 1. Check Format Rules
        const rawUsername = formData.username.substring(1); // Remove @
        if (rawUsername.length < 3) {
            setUsernameStatus('idle'); // Don't check server
            setUsernameError('Must be at least 3 characters');
            return;
        }
        if (rawUsername.length > 30) {
            setUsernameStatus('idle'); 
            setUsernameError('Must be max 30 characters');
            return;
        }
        if (rawUsername.startsWith('_') || rawUsername.endsWith('_')) {
            setUsernameStatus('idle');
            setUsernameError('Cannot start or end with underscore');
            return;
        }

        // Format OK
        setUsernameError('');
        setUsernameStatus('checking');
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/check-username?username=${formData.username}`);
                const data = await res.json();
                setUsernameStatus(data.available ? 'available' : 'taken');
            } catch (err) {
                console.error(err);
                setUsernameStatus('idle');
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [formData.username, view]);

    // Password Validation
    useEffect(() => {
        const hasUpperCase = /[A-Z]/.test(formData.password);
        const hasLowerCase = /[a-z]/.test(formData.password);
        const hasNumber = /[0-9]/.test(formData.password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(formData.password);
        const hasMinLength = formData.password.length >= 8;

        setPasswordValid(
            hasUpperCase && 
            hasLowerCase && 
            hasNumber && 
            hasSpecialChar && 
            hasMinLength
        );
    }, [formData.password]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        // [NEW] Check if locked out
        if (lockoutRemaining > 0) {
            setError(`Too many attempts. Please wait ${lockoutRemaining} seconds.`);
            return;
        }
        
        setIsSubmitting(true);

        if (view === 'signup') {
            if (usernameError) {
                setIsSubmitting(false);
                return setError(usernameError);
            }
            if (usernameStatus === 'taken') {
                setIsSubmitting(false);
                return setError('Username is already taken');
            }
            if (!passwordValid) {
                setIsSubmitting(false);
                return setError('Password does not meet all requirements');
            }
        }

        try {
            if (view === 'recovery') {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/recover-account`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        username: formData.username, 
                        recoveryCode: formData.recoveryCode, 
                        newPassword: formData.newPassword 
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Recovery failed');
                
                setView('login');
                setFormData(prev => ({ ...prev, password: '', recoveryCode: '', newPassword: '' }));
                alert('Password reset successfully! Please login.'); // Simple feedback for now
                setIsSubmitting(false);
                return;
            }

            const endpoint = view === 'login' ? '/api/auth/login' : '/api/auth/signup';
            
            // [OPTIMIZATION] For login: Start API call immediately, fetch crypto keys in parallel
            if (view === 'login') {
                // Start both operations in parallel for maximum speed
                const [apiResponse, cryptoKeys] = await Promise.all([
                    // 1. Start login API call immediately (don't wait for crypto)
                    fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    }),
                    // 2. Fetch crypto keys in parallel (these are pre-warmed, so fast)
                    (async () => {
                        try {
                            return {
                                deviceId: 'fallback-device',
                                publicKey: null,
                                signingPublicKey: null
                            };
                        } catch (e) {
                            console.warn('[Login] Crypto keys not ready:', e);
                            return null;
                        }
                    })()
                ]);

                const data = await apiResponse.json();
                if (!apiResponse.ok) throw new Error(data.error || 'Something went wrong');

                // [NEW] Track Last Used Login Method
                localStorage.setItem('last_login_method', 'password');

                // Register device in background (non-blocking) if we have keys
                if (cryptoKeys?.deviceId && cryptoKeys?.publicKey) {
                    fetch(`${import.meta.env.VITE_API_URL}/api/auth/device`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${data.token}`
                        },
                        body: JSON.stringify(cryptoKeys)
                    }).catch(e => console.warn('[Login] Background device registration failed:', e));
                }

                login(data.token, data.user, false);

                // Check for pending invite logic...
                const pendingInvite = localStorage.getItem('pendingInvite');
                if (pendingInvite) {
                    try {
                        const { type, value } = JSON.parse(pendingInvite);
                        localStorage.removeItem('pendingInvite');
                        if (type === 'group') navigate(`/dashboard?joinCode=${value}`);
                        else if (type === 'direct') navigate(`/dashboard?chatUser=${value}`);
                        else navigate('/');
                        return;
                    } catch (e) {
                        console.error('Invalid pending invite', e);
                    }
                }

                navigate('/');
                return;
            }

            // Signup flow (unchanged)
            const res = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Something went wrong');
            
            if (view === 'signup' && data.recoveryCode) {
                // Show Success Screen with Code
                setGeneratedRecoveryCode(data.recoveryCode);
                setPendingLogin({ token: data.token, user: data.user });
                setView('success');
                setIsSubmitting(false);
                return;
            }

            login(data.token, data.user, view === 'signup');

            // Check for pending invite logic...
            const pendingInvite = localStorage.getItem('pendingInvite');
            if (pendingInvite) {
                try {
                    const { type, value } = JSON.parse(pendingInvite);
                    localStorage.removeItem('pendingInvite');
                    if (type === 'group') navigate(`/dashboard?joinCode=${value}`);
                    else if (type === 'direct') navigate(`/dashboard?chatUser=${value}`);
                    else navigate('/');
                    return;
                } catch (e) {
                    console.error('Invalid pending invite', e);
                }
            }

            navigate('/');
        } catch (err) {
            setError(err.message);
            
            // [NEW] Track failed attempts for login only
            if (view === 'login') {
                const newAttempts = failedAttempts + 1;
                setFailedAttempts(newAttempts);
                localStorage.setItem('auth_failed_attempts', newAttempts.toString());
                
                if (newAttempts >= MAX_ATTEMPTS) {
                    const lockUntil = Date.now() + (LOCKOUT_DURATION * 1000);
                    setLockoutUntil(lockUntil);
                    localStorage.setItem('auth_lockout_until', lockUntil.toString());
                    setFailedAttempts(0);
                    localStorage.setItem('auth_failed_attempts', '0');
                    setError(`Too many failed attempts. Please wait ${LOCKOUT_DURATION} seconds.`);
                }
            }
            
            setIsSubmitting(false);
        }
    };

    const handleSetupBackup = async (e) => {
        e.preventDefault();
        setError('');
        
        if (backupPassword !== confirmBackupPassword) {
            setError('Passwords do not match');
            return;
        }

        if (backupPassword.length < 8) {
             setError('Password must be at least 8 characters');
             return;
        }

        setIsSubmitting(true);

        try {
            // 1. Ensure keys exist (Generate if new user)
            await cryptoManager.init();

            // 2. Create complete backup (v2.0 format with message history)
            const keyBundle = await cryptoManager.exportAllKeysSync();
            const [messages, rooms, users] = await Promise.all([
                db.messages.toArray(),
                db.rooms.toArray(),
                db.users.toArray()
            ]);

            const filteredMessages = messages.map(msg => {
                const filtered = { ...msg };
                delete filtered.fileBlob;
                delete filtered.localFilePath;
                return filtered;
            });

            const fullBundle = JSON.stringify({
                keys: JSON.parse(keyBundle),
                messages: filteredMessages,
                rooms: rooms,
                users: users,
                exportedAt: new Date().toISOString(),
                version: 2.0
            });
            
            const backup = await cryptoManager.encryptBackup(fullBundle, backupPassword);
            
            // 3. Upload to server
            // Use pendingLogin.token since we aren't "logged in" in context yet
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${pendingLogin.token}`
                },
                body: JSON.stringify({ ...backup, passwordHint: backupPasswordHint.trim() || null })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to upload backup');
            }

            // 4. Enable auto-backup
            await cryptoManager.enableAutoBackup(backupPassword, backup.salt, pendingLogin.token);

            // 5. Transition to Dashboard
            setView('entering_dashboard');
            
            setTimeout(() => {
                login(pendingLogin.token, pendingLogin.user, true);
            }, 2000);
             
        } catch (err) {
             console.error('[Backup Setup] Error:', err);
             setError(err.message || 'Failed to create backup');
             setIsSubmitting(false);
        }
    };



    return (
        <div className="h-[100dvh] w-full grid grid-cols-1 lg:grid-cols-2 bg-slate-950 overflow-hidden">
            {/* Left Side - Visual */}
            <div className="relative hidden lg:flex flex-col items-center justify-center p-8 overflow-hidden bg-slate-900 h-full">
                {/* Background Gradients */}
                <div className="absolute inset-0 w-full h-full">
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950" />
                    <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-600/20 rounded-full blur-[100px] animate-pulse" />
                    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px]" />
                </div>

                {/* Mock Chat Interface Container */}
                <div className="relative z-10 w-full max-w-[420px] perspective-1000">
                    <div className="transform rotate-y-[-5deg] rotate-x-[5deg] hover:rotate-0 transition-transform duration-700 ease-out">
                        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/5">
                            {/* Mock Header */}
                            <div className="bg-white/5 p-4 flex items-center gap-3 border-b border-white/5">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                    TG
                                </div>
                                <div>
                                    <div className="h-2.5 w-24 bg-slate-700 rounded-full mb-1.5" />
                                    <div className="h-2 w-16 bg-slate-800 rounded-full" />
                                </div>
                                <div className="ml-auto flex gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    <div className="w-2 h-2 rounded-full bg-slate-700" />
                                </div>
                            </div>

                            {/* Mock Messages */}
                            <div className="p-5 space-y-4 min-h-[320px] bg-gradient-to-b from-transparent to-black/20">
                                {/* Incoming - Feature: No Email */}
                                <div className="flex gap-3 opacity-0 animate-fade-in-up" style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}>
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0" />
                                    <div className="bg-slate-800/80 p-3 rounded-2xl rounded-tl-none text-xs text-slate-300 shadow-sm border border-white/5 max-w-[85%]">
                                        <p>Wait, I don't need an email to sign up?</p>
                                    </div>
                                </div>

                                {/* Outgoing - Confirmation */}
                                <div className="flex gap-3 flex-row-reverse opacity-0 animate-fade-in-up" style={{ animationDelay: '2500ms', animationFillMode: 'forwards' }}>
                                    <div className="bg-violet-600 p-3 rounded-2xl rounded-tr-none text-xs text-white shadow-md shadow-violet-500/10 max-w-[85%]">
                                        <p>Nope! Just pick a username and start chatting instantly.</p>
                                    </div>
                                </div>

                                {/* Incoming - Feature: Privacy */}
                                <div className="flex gap-3 opacity-0 animate-fade-in-up" style={{ animationDelay: '4500ms', animationFillMode: 'forwards' }}>
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0" />
                                    <div className="bg-slate-800/80 p-3 rounded-2xl rounded-tl-none text-xs text-slate-300 shadow-sm border border-white/5 max-w-[85%]">
                                        <p>That's awesome. And what about my data?</p>
                                    </div>
                                </div>

                                {/* Outgoing - Feature: Zero Logs */}
                                <div className="flex gap-3 flex-row-reverse opacity-0 animate-fade-in-up" style={{ animationDelay: '6500ms', animationFillMode: 'forwards' }}>
                                    <div className="bg-violet-600 p-3 rounded-2xl rounded-tr-none text-xs text-white shadow-md shadow-violet-500/10 max-w-[85%]">
                                        <p>Zero logs. Rooms expire automatically. Complete privacy.</p>
                                    </div>
                                </div>
                                
                                {/* Typing Indicator */}
                                <div className="flex gap-2 ml-11 opacity-0 animate-fade-in-up" style={{ animationDelay: '8000ms', animationFillMode: 'forwards' }}>
                                    <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>

                            {/* Mock Input */}
                            <div className="p-4 bg-white/5 border-t border-white/5 flex gap-3">
                                <div className="flex-1 h-10 bg-black/20 rounded-xl border border-white/5" />
                                <div className="w-10 h-10 bg-violet-600/20 rounded-xl border border-violet-500/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-violet-400 text-sm">send</span>
                                </div>
                            </div>
                        </div>

                        {/* Floating Decor */}
                        <div className="absolute -right-8 top-20 bg-slate-800/80 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-xl animate-[float_4s_ease-in-out_infinite_delay-1000] group cursor-pointer">
                            <div className="relative">
                                <span className="text-2xl relative z-10 transition-transform duration-300 group-hover:scale-110 block">🔒</span>
                                {/* Security Pulse Rings */}
                                <div className="absolute inset-0 rounded-full border border-violet-400/30 animate-[lock-pulse_2s_ease-out_infinite] z-0" />
                                <div className="absolute inset-0 rounded-full border border-violet-400/30 animate-[lock-pulse_2s_ease-out_infinite_delay-1000] z-0" />
                            </div>
                        </div>
                        <div className="absolute -left-6 bottom-32 bg-slate-800/80 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-xl animate-[float_5s_ease-in-out_infinite_delay-500]">
                            {/* Custom SVG Rocket for perfect alignment */}
                            <svg width="42" height="42" viewBox="-10 -10 60 75" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform rotate-45">
                                {/* Flame Group - Animated */}
                                <g className="animate-[rocket-burn-svg_0.15s_ease-in-out_infinite] origin-[20px_35px]">
                                    {/* Main Thrust */}
                                    <path d="M20 35 C 16 45, 10 55, 20 65 C 30 55, 24 45, 20 35" fill="url(#flameGradient)" filter="url(#glow)" />
                                    {/* Inner Core */}
                                    <path d="M20 35 C 18 42, 16 48, 20 50 C 24 48, 22 42, 20 35" fill="#FFF" fillOpacity="0.8" />
                                </g>
                                
                                {/* Rocket Body */}
                                <path d="M20 0 C 20 0, 35 15, 35 30 C 35 40, 20 40, 20 40 C 20 40, 5 40, 5 30 C 5 15, 20 0, 20 0 Z" fill="#E2E8F0" />
                                <path d="M20 0 C 20 0, 28 15, 28 30 C 28 40, 20 40, 20 40" fill="#CBD5E1" /> {/* Shading */}
                                
                                {/* Window */}
                                <circle cx="20" cy="20" r="5" fill="#38BDF8" stroke="#94A3B8" strokeWidth="2" />
                                
                                {/* Fins */}
                                <path d="M5 30 L -2 42 L 10 38" fill="#F43F5E" />
                                <path d="M35 30 L 42 42 L 30 38" fill="#F43F5E" />
                                <path d="M20 35 L 20 42" stroke="#F43F5E" strokeWidth="4" strokeLinecap="round" />

                                {/* Defs */}
                                <defs>
                                    <linearGradient id="flameGradient" x1="20" y1="35" x2="20" y2="65" gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#F59E0B" />
                                        <stop offset="0.5" stopColor="#EF4444" />
                                        <stop offset="1" stopColor="#EF4444" stopOpacity="0" />
                                    </linearGradient>
                                    <filter id="glow" x="0" y="0" width="200%" height="200%">
                                        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                        <feMerge>
                                            <feMergeNode in="coloredBlur" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                </defs>
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="mt-12 text-center relative z-10">
                    <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
                        Conversations, <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">Unbound</span>.
                    </h1>
                    <p className="text-slate-400 max-w-sm mx-auto">
                        No login required. No history saved. Just instant, secure, and anonymous messaging that disappears when you leave.
                    </p>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="h-full overflow-y-auto bg-slate-950 relative custom-scrollbar">
                <div className="min-h-full flex items-center justify-center p-6 lg:p-12">
                    <div className="w-full max-w-md space-y-8">
                    <div className="text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-white mb-2">
                            {view === 'login' ? (loginTab === 'qr' ? 'QR Code Login' : 'Welcome Back') : 
                             view === 'signup' ? 'Create Account' : 
                             view === 'recovery' ? 'Recover Account' : 
                             view === 'setup_backup' ? 'Cloud Backup' : 
                             view === 'entering_dashboard' ? 'All Set!' : 'Account Created'}
                        </h2>
                        <p className="text-slate-400">
                            {view === 'login' ? (loginTab === 'qr' ? 'Scan this QR code from your other device.' : 'Enter your details to access your workspace.') : 
                             view === 'signup' ? 'Get started with your free account today.' : 
                             view === 'recovery' ? 'Enter your recovery code to reset your password.' : 
                             view === 'setup_backup' ? 'Create a password-protected backup of your encryption keys.' :
                             view === 'entering_dashboard' ? 'Preparing your secure environment...' :
                             'Save your recovery code securely.'}
                        </p>
                    </div>

                    {/* [NEW] Login Method Tabs */}
                    {view === 'login' && (
                        <div className="relative flex bg-slate-900/50 rounded-full p-1 border border-slate-800/50">
                            {/* Sliding highlight pill */}
                            <div 
                                className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-violet-600 rounded-full shadow-lg shadow-violet-500/20 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                                style={{ left: loginTab === 'password' ? '4px' : 'calc(50% + 0px)' }}
                            />
                            <button
                                onClick={() => setLoginTab('password')}
                                className={`relative z-10 flex-1 py-2.5 px-4 rounded-[10px] text-sm font-bold transition-colors duration-300 flex items-center justify-center gap-2 ${
                                    loginTab === 'password'
                                        ? 'text-white'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <span className="material-symbols-outlined text-lg">password</span>
                                Password
                            </button>
                            <button
                                onClick={() => setLoginTab('qr')}
                                className={`relative z-10 flex-1 py-2.5 px-4 rounded-[10px] text-sm font-bold transition-colors duration-300 flex items-center justify-center gap-2 ${
                                    loginTab === 'qr'
                                        ? 'text-white'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <span className="material-symbols-outlined text-lg">qr_code_2</span>
                                QR Code
                            </button>
                        </div>
                    )}

                    {/* [NEW] Lockout Timer Display */}
                    {lockoutRemaining > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl animate-pulse">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-amber-500 text-xl">hourglass_top</span>
                                </div>
                                <div>
                                    <h4 className="text-amber-400 font-bold text-sm">Too Many Attempts</h4>
                                    <p className="text-amber-500/70 text-xs">Please wait before trying again</p>
                                </div>
                            </div>
                            <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-1000"
                                    style={{ width: `${(lockoutRemaining / LOCKOUT_DURATION) * 100}%` }}
                                />
                            </div>
                            <p className="text-center text-amber-400 font-mono font-bold text-lg mt-2">
                                {lockoutRemaining}s
                            </p>
                        </div>
                    )}

                    {error && !lockoutRemaining && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center gap-3">
                            <span className="material-symbols-outlined text-xl">error</span>
                            {error}
                        </div>
                    )}

                    {view === 'success' ? (
                        <div className="space-y-6">
                            <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-2xl">
                                <h3 className="text-amber-500 font-bold mb-2 flex items-center gap-2">
                                    <span className="material-symbols-outlined">warning</span>
                                    Save this Recovery Code!
                                </h3>
                                <p className="text-slate-400 text-sm mb-4">
                                    This is the <strong>ONLY</strong> way to recover your account if you forget your password. We cannot show it again.
                                </p>
                                <div className="relative group">
                                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 font-mono text-center text-lg text-white select-all">
                                        {generatedRecoveryCode}
                                    </div>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(generatedRecoveryCode);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 transition-all duration-200 ${
                                            copied 
                                                ? 'text-emerald-500 opacity-100 scale-110' 
                                                : 'text-slate-500 hover:text-white opacity-0 group-hover:opacity-100'
                                        }`}
                                        title={copied ? "Copied!" : "Copy to clipboard"}
                                    >
                                        <span className="material-symbols-outlined text-lg">
                                            {copied ? 'check_circle' : 'content_copy'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (pendingLogin) {
                                        setGeneratedRecoveryCode(''); // Clear code from UI
                                        setView('setup_backup'); // Proceed to Backup Setup
                                    } else {
                                        navigate('/');
                                    }
                                }}  
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-all duration-200"
                            >
                                I have saved it, Continue
                            </button>
                        </div>
                    ) : view === 'setup_backup' ? (
                        <form onSubmit={handleSetupBackup} className="space-y-4">
                             <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 mb-4 flex gap-3">
                                 <span className="material-symbols-outlined text-violet-400">lock</span>
                                 <p className="text-[11px] text-slate-400 leading-relaxed">
                                     Your chats are end-to-end encrypted. This passcode secures your history and keys so you can log in on other devices.
                                 </p>
                             </div>
                             
                             <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 mb-6 flex gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                                 <span className="material-symbols-outlined text-emerald-500">sync</span>
                                 <div>
                                     <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">Smart Auto-Sync Enabled</p>
                                     <p className="text-[11px] text-slate-400 leading-relaxed">
                                         Setting a passcode activates <strong>Auto-Backup</strong>. Your encryption keys and chat history will sync silently to the cloud. You can turn this off anytime in Profile settings.
                                     </p>
                                 </div>
                             </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Create Password</label>
                                <div className="relative">
                                    <input
                                        type={showBackupPassword ? "text" : "password"}
                                        value={backupPassword}
                                        onChange={(e) => setBackupPassword(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                        placeholder="Strong password"
                                        required
                                        minLength={8}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowBackupPassword(!showBackupPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-emerald-500 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">
                                            {showBackupPassword ? 'visibility' : 'visibility_off'}
                                        </span>
                                    </button>
                                </div>
                                <div className="mt-2 space-y-1">
                                    <p className={`text-[10px] flex items-center gap-1.5 font-medium transition-colors ${backupPassword.length >= 8 ? 'text-emerald-500' : 'text-slate-500'}`}>
                                        <span className="material-symbols-outlined text-[14px]">
                                            {backupPassword.length >= 8 ? 'check_circle' : 'circle'}
                                        </span>
                                        Minimum 8 characters
                                    </p>
                                    <p className={`text-[10px] flex items-center gap-1.5 font-medium transition-colors ${/[0-9]/.test(backupPassword) ? 'text-emerald-500' : 'text-slate-500'}`}>
                                        <span className="material-symbols-outlined text-[14px]">
                                            {/[0-9]/.test(backupPassword) ? 'check_circle' : 'circle'}
                                        </span>
                                        At least one number
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Confirm Password</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmBackupPassword ? "text" : "password"}
                                        value={confirmBackupPassword}
                                        onChange={(e) => setConfirmBackupPassword(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                        placeholder="Repeat password"
                                        required
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowConfirmBackupPassword(!showConfirmBackupPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-emerald-500 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">
                                            {showConfirmBackupPassword ? 'visibility' : 'visibility_off'}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password Hint (Optional)</label>
                                <input
                                    type="text"
                                    value={backupPasswordHint}
                                    onChange={(e) => setBackupPasswordHint(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                    placeholder="Something to help you remember"
                                    maxLength={100}
                                />
                            </div>

                             <button 
                                type="submit" 
                                disabled={isSubmitting || backupPassword.length < 8 || !/[0-9]/.test(backupPassword) || backupPassword !== confirmBackupPassword}
                                className={`w-full font-bold py-3.5 rounded-xl transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                                    isSubmitting || backupPassword.length < 8 || !/[0-9]/.test(backupPassword) || backupPassword !== confirmBackupPassword
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                                }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                        Setting up Backup...
                                    </>
                                ) : (
                                    <>
                                        Set Backup & User Account
                                        <span className="material-symbols-outlined text-lg">verified_user</span>
                                    </>
                                )}
                            </button>

                             <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3">
                                <span className="material-symbols-outlined text-amber-500 text-xl shrink-0">warning</span>
                                <p className="text-[10px] text-amber-500/80 leading-relaxed uppercase font-bold tracking-tight">
                                    Cipher cannot reset this password. If you lose it, your backup is permanently unrecoverable.
                                </p>
                            </div>
                        </form>
                    ) : view === 'entering_dashboard' ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-6">
                            <div className="relative">
                                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                                <SpinLoading size={64} color="text-emerald-500" />
                            </div>
                            <div className="space-y-2 text-center">
                                <h3 className="text-xl font-bold text-white animate-pulse">Entering Dashboard...</h3>
                                <p className="text-sm text-slate-400">Decryption keys ready.</p>
                            </div>
                        </div>
                    ) : view === 'login' && loginTab === 'qr' ? (
                        <QRLoginPanel
                            onSuccess={async (authToken, user) => {
                                localStorage.setItem('last_login_method', 'qr');
                                await login(authToken, user, false);
                                const pendingInvite = localStorage.getItem('pendingInvite');
                                if (pendingInvite) {
                                    try {
                                        const { type, value } = JSON.parse(pendingInvite);
                                        localStorage.removeItem('pendingInvite');
                                        if (type === 'group') navigate(`/dashboard?joinCode=${value}`);
                                        else if (type === 'direct') navigate(`/dashboard?chatUser=${value}`);
                                        else navigate('/');
                                        return;
                                    } catch (e) { console.error('Invalid pending invite', e); }
                                }
                                navigate('/');
                            }}
                        />
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Display Name Field */}
                            {view === 'signup' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Display Name</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500/50 border border-slate-800 focus:border-violet-500/50 transition-all placeholder:text-slate-600 cursor-text"
                                            placeholder="Shadow"
                                            value={formData.displayName}
                                            onChange={e => setFormData({...formData, displayName: e.target.value})}
                                            required={view === 'signup'}
                                        />
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">badge</span>
                                    </div>
                                </div>
                            )}

                            {/* Username Field */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Username</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        className={`w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:ring-2 border transition-all placeholder:text-slate-600 cursor-text ${
                                            view === 'signup' && usernameStatus === 'available' ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' :
                                            view === 'signup' && usernameStatus === 'taken' ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' :
                                            'border-slate-800 focus:border-violet-500/50 focus:ring-violet-500/50'
                                        }`}
                                        placeholder="@shadow"
                                        value={formData.username}
                                        onChange={e => {
                                            // [NEW] Strict Input Filtering
                                            let value = e.target.value.replace(/@/g, '');
                                            // Allow only a-z, A-Z, 0-9, _
                                            value = value.replace(/[^a-zA-Z0-9_]/g, '');
                                            setFormData({...formData, username: value ? '@' + value : '@'});
                                        }}
                                        onFocus={() => setIsUsernameFocused(true)}
                                        onBlur={() => setIsUsernameFocused(false)}
                                        required
                                    />
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">person</span>
                                    
                                    {/* Username Status Icon */}
                                    {view === 'signup' && formData.username && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {usernameStatus === 'checking' && <span className="material-symbols-outlined text-slate-500 animate-spin text-lg">progress_activity</span>}
                                            {usernameStatus === 'available' && <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>}
                                            {usernameStatus === 'taken' && <span className="material-symbols-outlined text-red-500 text-lg">cancel</span>}
                                        </div>
                                    )}
                                </div>
                                {view === 'signup' && usernameStatus === 'taken' && (
                                    <p className="text-xs text-red-400">Username is already taken.</p>
                                )}
                                {view === 'signup' && usernameError && (
                                    <p className="text-xs text-red-400">{usernameError}</p>
                                )}
                                    {view === 'signup' && (
                                        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                                            isUsernameFocused ? 'max-h-[300px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'
                                        }`}>
                                            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                                                {[
                                                    { label: 'Must be at least 3 characters long and can have a maximum length of 30 characters.', valid: formData.username.length > 3 && formData.username.length <= 31 }, // accounts for @
                                                    { label: 'Can only contain alphabets, numbers, and underscores.', valid: /^[a-zA-Z0-9_@]*$/.test(formData.username) },
                                                    { label: 'Your username cannot start or end with a underscore, or contain special characters.', valid: !formData.username.substring(1).startsWith('_') && !formData.username.substring(1).endsWith('_') && formData.username.length > 1 }
                                                ].map((rule, i) => (
                                                    <div key={i} className="flex items-start gap-3 text-xs transition-colors duration-200 mb-2 last:mb-0">
                                                        <div className={`mt-2 min-w-[4px] h-1 w-1 rounded-full shrink-0 ${
                                                            rule.valid ? 'bg-green-400' : 'bg-slate-500'
                                                        }`} />
                                                        <span className={`${rule.valid ? 'text-green-400' : 'text-slate-400'} leading-relaxed`}>
                                                            {rule.label}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                            </div>

                            {/* Recovery Code Field */}
                            {view === 'recovery' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Recovery Code</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500/50 border border-slate-800 focus:border-violet-500/50 transition-all placeholder:text-slate-600 font-mono"
                                            placeholder="RECOVERY-XXXX-XXXX"
                                            value={formData.recoveryCode}
                                            onChange={e => setFormData({...formData, recoveryCode: e.target.value})}
                                            required
                                        />
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">vpn_key</span>
                                    </div>
                                </div>
                            )}

                            {/* Password Field (used for Login Password or Recovery New Password) */}
                            {view !== 'recovery' && (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-medium text-slate-300">Password</label>
                                        {view === 'login' && (
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    setView('recovery');
                                                    setError('');
                                                }}
                                                className="text-xs text-violet-400 hover:text-white transition-colors"
                                            >
                                                Forgot Password?
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input 
                                            type={showPassword ? 'text' : 'password'} 
                                            className={`w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:ring-2 border transition-all placeholder:text-slate-600 ${
                                                view === 'signup' && passwordValid ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' :
                                                view === 'signup' && formData.password ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' :
                                                'border-slate-800 focus:border-violet-500/50 focus:ring-violet-500/50'
                                            }`}
                                            placeholder="••••••••"
                                            value={formData.password}
                                            onChange={e => setFormData({...formData, password: e.target.value})}
                                            required
                                        />
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">lock</span>
                                        
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none"
                                        >
                                            <span className="material-symbols-outlined text-lg">
                                                {showPassword ? 'visibility' : 'visibility_off'}
                                            </span>
                                        </button>

                                        {view === 'signup' && formData.password && (
                                            <div className="absolute right-10 top-1/2 -translate-y-1/2">
                                                {passwordValid  
                                                    ? <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>
                                                    : <span className="material-symbols-outlined text-red-500 text-lg">cancel</span>
                                                }
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Password Requirements Checklist */}
                                    {view === 'signup' && (
                                        <div className="mt-3 space-y-2 bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                                            <p className="text-xs font-medium text-slate-400 mb-2">Password Requirements:</p>
                                            {[
                                                { label: 'One uppercase letter', valid: /[A-Z]/.test(formData.password) },
                                                { label: 'One lowercase letter', valid: /[a-z]/.test(formData.password) },
                                                { label: 'One number', valid: /[0-9]/.test(formData.password) },
                                                { label: 'One special character', valid: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password) },
                                                { label: 'Minimum 8 characters', valid: formData.password.length >= 8 }
                                            ].map((rule, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs transition-colors duration-200">
                                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                                                        rule.valid 
                                                            ? 'bg-green-500/10 border-green-500/50 text-green-500' 
                                                            : 'bg-slate-800 border-slate-700 text-slate-600'
                                                    }`}>
                                                        {rule.valid && <span className="material-symbols-outlined text-[10px] font-bold">check</span>}
                                                    </div>
                                                    <span className={rule.valid ? 'text-green-400' : 'text-slate-500'}>
                                                        {rule.label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* New Password Field (for Recovery) */}
                            {view === 'recovery' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">New Password</label>
                                    <div className="relative">
                                        <input 
                                            type="password" 
                                            className="w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500/50 border border-slate-800 focus:border-violet-500/50 transition-all placeholder:text-slate-600"
                                            placeholder="••••••••"
                                            value={formData.newPassword}
                                            onChange={e => setFormData({...formData, newPassword: e.target.value})}
                                            required={view === 'recovery'}
                                        />
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">lock_reset</span>
                                    </div>
                                </div>
                            )}
                            
                            <button 
                                type="submit" 
                                disabled={isSubmitting || lockoutRemaining > 0 || (view === 'signup' && (usernameStatus !== 'available' || !passwordValid))}
                                className={`w-full font-bold py-3.5 rounded-xl transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                                    isSubmitting || lockoutRemaining > 0 || (view === 'signup' && (usernameStatus !== 'available' || !passwordValid))
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-500/20 transform hover:scale-[1.01] active:scale-[0.99]'
                                }`}
                            >
                                {lockoutRemaining > 0 ? (
                                    <>
                                        <span className="material-symbols-outlined text-lg">timer</span>
                                        Try again in {lockoutRemaining}s
                                    </>
                                ) : isSubmitting ? (
                                    <>
                                        <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                        {view === 'login' ? 'Signing In...' : view === 'signup' ? 'Creating Account...' : 'Resetting...'}
                                    </>
                                ) : (
                                    <>
                                        {view === 'login' ? 'Sign In' : view === 'signup' ? 'Create Account' : 'Reset Password'}
                                        <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                    
                    {view !== 'success' && view !== 'recovery' && view !== 'setup_backup' && view !== 'entering_dashboard' && (
                        <>
                            {/* OAuth Divider */}
                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-800"></div>
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-4 bg-slate-950 text-slate-500">Or continue with</span>
                                </div>
                            </div>

                            {/* OAuth Buttons */}
                            <OAuthButtons mode={view} lastUsedMethod={localStorage.getItem('last_login_method')} />
                        </>
                    )}
                    
                    <div className="text-center pt-4">
                        <p className="text-slate-400 text-sm">
                            {view === 'login' ? "Don't have an account? " : 
                             view === 'signup' ? "Already have an account? " : 
                             view === 'recovery' ? "Remember your password? " : ""}
                             
                            {view !== 'success' && view !== 'setup_backup' && view !== 'entering_dashboard' && (
                                <button 
                                    onClick={() => {
                                        setView(view === 'login' ? 'signup' : 'login');
                                        setError('');
                                        setFormData(prev => ({ ...prev, username: '', password: '', recoveryCode: '', newPassword: '' }));
                                    }}
                                    className="text-violet-400 font-bold hover:text-violet-300 transition-colors"
                                >
                                    {view === 'login' ? "Sign Up" : "Sign In"}
                                </button>
                            )}
                        </p>
                    </div>
                </div>
                </div>
            </div>
            {isLoading && <SpinLoading />}
        </div>
    );
}

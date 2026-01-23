import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import SpinLoading from '../components/SpinLoading';
import OAuthButtons from '../components/OAuthButtons';
import { cryptoManager } from '../lib/crypto/CryptoManager';

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

            // 2. Export all keys
            const bundle = await cryptoManager.exportAllKeysSync();

            // 3. Encrypt bundle
            const backup = await cryptoManager.encryptBackup(bundle, backupPassword);
            
            // 4. Upload to server
            // Use pendingLogin.token since we aren't "logged in" in context yet
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${pendingLogin.token}`
                },
                body: JSON.stringify({ ...backup, passwordHint: backupPasswordHint.trim() || null })
            });

            if (!res.ok) throw new Error('Failed to upload backup');

            // 5. Enable auto-backup
            await cryptoManager.enableAutoBackup(backupPassword, backup.salt, pendingLogin.token);

            // 6. Transition to Dashboard
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
                            {view === 'login' ? 'Welcome Back' : 
                             view === 'signup' ? 'Create Account' : 
                             view === 'recovery' ? 'Recover Account' : 
                             view === 'setup_backup' ? 'Cloud Backup' : 
                             view === 'entering_dashboard' ? 'All Set!' : 'Account Created'}
                        </h2>
                        <p className="text-slate-400">
                            {view === 'login' ? 'Enter your details to access your workspace.' : 
                             view === 'signup' ? 'Get started with your free account today.' : 
                             view === 'recovery' ? 'Enter your recovery code to reset your password.' : 
                             view === 'setup_backup' ? 'Create a password-protected backup of your encryption keys.' :
                             view === 'entering_dashboard' ? 'Preparing your secure environment...' :
                             'Save your recovery code securely.'}
                        </p>
                    </div>

                    {error && (
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
                             <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 mb-6">
                                <div className="flex gap-3">
                                    <span className="material-symbols-outlined text-violet-400">cloud_upload</span>
                                    <p className="text-sm text-slate-400">
                                        Your chats are end-to-end encrypted. We need this password to securely backup your keys so you can restore your history on other devices.
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
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Username Field */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Username</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        className={`w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:ring-2 border transition-all placeholder:text-slate-600 ${
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
                                disabled={isSubmitting || (view === 'signup' && (usernameStatus !== 'available' || !passwordValid))}
                                className={`w-full font-bold py-3.5 rounded-xl transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                                    isSubmitting || (view === 'signup' && (usernameStatus !== 'available' || !passwordValid))
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-500/20 transform hover:scale-[1.01] active:scale-[0.99]'
                                }`}
                            >
                                {isSubmitting ? (
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
                            <OAuthButtons mode={view} />
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

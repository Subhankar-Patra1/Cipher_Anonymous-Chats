import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SpinLoading from '../components/SpinLoading';

export default function Auth() {
    const [view, setView] = useState('login'); // 'login', 'signup', 'recovery', 'success'
    const [formData, setFormData] = useState({ username: '', password: '', displayName: '', recoveryCode: '', newPassword: '' });
    const [error, setError] = useState('');
    const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState('');
    const [pendingLogin, setPendingLogin] = useState(null); // Store login data temporarily
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    // Validation States
    const [usernameStatus, setUsernameStatus] = useState('idle'); // idle, checking, available, taken
    const [passwordValid, setPasswordValid] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Debounce Username Check
    // Debounce Username Check
    useEffect(() => {
        if (view !== 'signup' || !formData.username || formData.username === '@') {
            setUsernameStatus('idle');
            return;
        }

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

            login(data.token, data.user);

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

    return (
        <div className="h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-slate-950 overflow-hidden">
            {/* Left Side - Visual */}
            <div className="relative hidden lg:flex flex-col items-center justify-center p-12 overflow-hidden bg-slate-900 h-full">
                {/* Abstract Background */}
                <div className="absolute inset-0 w-full h-full">
                    <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-violet-600/20 rounded-full blur-[120px] animate-pulse" />
                    <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse delay-1000" />
                    <div className="absolute top-[40%] left-[40%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[100px]" />
                </div>

                {/* Content */}
                <div className="relative z-10 text-center max-w-lg">
                    <div className="w-24 h-24 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-3xl mx-auto flex items-center justify-center mb-8 shadow-2xl shadow-violet-500/30 transform -rotate-6">
                        <span className="material-symbols-outlined text-5xl text-white">chat_bubble</span>
                    </div>
                    <h1 className="text-5xl font-bold text-white mb-6 tracking-tight">
                        Chat without <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">Limits</span>.
                    </h1>
                    <p className="text-slate-400 text-lg leading-relaxed">
                        Create expiring rooms, share secure codes, and connect instantly. No email required, just pick a username and start chatting.
                    </p>
                </div>

                {/* Decorative Elements */}
                <div className="absolute bottom-12 left-12 flex gap-4 opacity-50">
                    <div className="w-3 h-3 rounded-full bg-slate-700" />
                    <div className="w-3 h-3 rounded-full bg-slate-700" />
                    <div className="w-3 h-3 rounded-full bg-violet-500" />
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
                             view === 'recovery' ? 'Recover Account' : 'Account Created'}
                        </h2>
                        <p className="text-slate-400">
                            {view === 'login' ? 'Enter your details to access your workspace.' : 
                             view === 'signup' ? 'Get started with your free account today.' : 
                             view === 'recovery' ? 'Enter your recovery code to reset your password.' : 
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
                                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 font-mono text-center text-lg text-white select-all relative group">
                                    {generatedRecoveryCode}
                                    <button 
                                        onClick={() => navigator.clipboard.writeText(generatedRecoveryCode)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                        title="Copy to clipboard"
                                    >
                                        <span className="material-symbols-outlined text-sm">content_copy</span>
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (pendingLogin) {
                                        setIsLoading(true);
                                        setTimeout(() => {
                                            login(pendingLogin.token, pendingLogin.user);
                                            // Navigation handled by PublicRoute in App.jsx
                                        }, 2000);
                                    } else {
                                        navigate('/');
                                    }
                                }}  
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-all duration-200"
                            >
                                I have saved it, Continue
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {view === 'signup' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Display Name</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500/50 border border-slate-800 focus:border-violet-500/50 transition-all placeholder:text-slate-600"
                                            placeholder="John Doe"
                                            value={formData.displayName}
                                            onChange={e => setFormData({...formData, displayName: e.target.value})}
                                            required
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
                                        className={`w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:ring-2 border transition-all placeholder:text-slate-600 ${
                                            view === 'signup' && usernameStatus === 'available' ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' :
                                            view === 'signup' && usernameStatus === 'taken' ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' :
                                            'border-slate-800 focus:border-violet-500/50 focus:ring-violet-500/50'
                                        }`}
                                        placeholder="@johndoe"
                                        value={formData.username}
                                        onChange={e => {
                                            const value = e.target.value.replace(/@/g, '');
                                            setFormData({...formData, username: value ? '@' + value : '@'});
                                        }}
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
                                {view === 'signup' && (
                                    <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[10px]">info</span>
                                        Username cannot be changed, but Display Name can.
                                    </p>
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
                    
                    <div className="text-center pt-4">
                        <p className="text-slate-400 text-sm">
                            {view === 'login' ? "Don't have an account? " : 
                             view === 'signup' ? "Already have an account? " : 
                             view === 'recovery' ? "Remember your password? " : ""}
                             
                            {view !== 'success' && (
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

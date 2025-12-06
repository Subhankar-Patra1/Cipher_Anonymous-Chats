import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ username: '', password: '', displayName: '' });
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    // Validation States
    const [usernameStatus, setUsernameStatus] = useState('idle'); // idle, checking, available, taken
    const [passwordValid, setPasswordValid] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Debounce Username Check
    useEffect(() => {
        if (isLogin || !formData.username) {
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
    }, [formData.username, isLogin]);

    // Password Validation
    useEffect(() => {
        setPasswordValid(formData.password.length >= 6);
    }, [formData.password]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!isLogin) {
            if (usernameStatus === 'taken') return setError('Username is already taken');
            if (!passwordValid) return setError('Password must be at least 6 characters');
        }
        
        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
        
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Something went wrong');
            
            login(data.token, data.user);
            navigate('/');
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-950">
            {/* Left Side - Visual */}
            <div className="relative hidden lg:flex flex-col items-center justify-center p-12 overflow-hidden bg-slate-900">
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
            <div className="flex items-center justify-center p-6 lg:p-12 bg-slate-950 relative">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-white mb-2">
                            {isLogin ? 'Welcome Back' : 'Create Account'}
                        </h2>
                        <p className="text-slate-400">
                            {isLogin ? 'Enter your details to access your workspace.' : 'Get started with your free account today.'}
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center gap-3">
                            <span className="material-symbols-outlined text-xl">error</span>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {!isLogin && (
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
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Username</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    className={`w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:ring-2 border transition-all placeholder:text-slate-600 ${
                                        !isLogin && usernameStatus === 'available' ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' :
                                        !isLogin && usernameStatus === 'taken' ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' :
                                        'border-slate-800 focus:border-violet-500/50 focus:ring-violet-500/50'
                                    }`}
                                    placeholder="johndoe"
                                    value={formData.username}
                                    onChange={e => setFormData({...formData, username: e.target.value})}
                                    required
                                />
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">person</span>
                                
                                {/* Username Status Icon */}
                                {!isLogin && formData.username && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        {usernameStatus === 'checking' && <span className="material-symbols-outlined text-slate-500 animate-spin text-lg">progress_activity</span>}
                                        {usernameStatus === 'available' && <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>}
                                        {usernameStatus === 'taken' && <span className="material-symbols-outlined text-red-500 text-lg">cancel</span>}
                                    </div>
                                )}
                            </div>
                            {!isLogin && usernameStatus === 'taken' && (
                                <p className="text-xs text-red-400">Username is already taken.</p>
                            )}
                            {!isLogin && (
                                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[10px]">info</span>
                                    Username cannot be changed, but Display Name can.
                                </p>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Password</label>
                            <div className="relative">
                                <input 
                                    type={showPassword ? 'text' : 'password'} 
                                    className={`w-full bg-slate-900/50 text-white rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:ring-2 border transition-all placeholder:text-slate-600 ${
                                        !isLogin && passwordValid ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' :
                                        !isLogin && formData.password ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' :
                                        'border-slate-800 focus:border-violet-500/50 focus:ring-violet-500/50'
                                    }`}
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                    required
                                />
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">lock</span>
                                
                                {/* Toggle Password Visibility */}
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none"
                                >
                                    <span className="material-symbols-outlined text-lg">
                                        {showPassword ? 'visibility' : 'visibility_off'}
                                    </span>
                                </button>

                                {/* Password Status Icon (Shifted left if signup) */}
                                {!isLogin && formData.password && (
                                    <div className="absolute right-10 top-1/2 -translate-y-1/2">
                                        {passwordValid 
                                            ? <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>
                                            : <span className="material-symbols-outlined text-red-500 text-lg">cancel</span>
                                        }
                                    </div>
                                )}
                            </div>
                            <p className={`text-xs flex items-center gap-1 transition-colors ${!isLogin && formData.password ? (passwordValid ? 'text-green-400' : 'text-slate-500') : 'text-slate-500'}`}>
                                <span className="material-symbols-outlined text-[10px]">info</span>
                                Must be at least 6 characters long.
                            </p>
                        </div>
                        
                        <button 
                            type="submit" 
                            disabled={!isLogin && (usernameStatus !== 'available' || !passwordValid)}
                            className={`w-full font-bold py-3.5 rounded-xl transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                                !isLogin && (usernameStatus !== 'available' || !passwordValid)
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-500/20 transform hover:scale-[1.01] active:scale-[0.99]'
                            }`}
                        >
                            {isLogin ? 'Sign In' : 'Create Account'}
                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                        </button>
                    </form>
                    
                    <div className="text-center pt-4">
                        <p className="text-slate-400 text-sm">
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <button 
                                onClick={() => {
                                    setIsLogin(!isLogin);
                                    setError('');
                                    setFormData({ username: '', password: '', displayName: '' });
                                }}
                                className="text-violet-400 font-bold hover:text-violet-300 transition-colors"
                            >
                                {isLogin ? "Sign Up" : "Sign In"}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

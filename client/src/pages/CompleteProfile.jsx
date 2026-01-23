import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SpinLoading from '../components/SpinLoading';

export default function CompleteProfile() {
    const { user, updateUser, token } = useAuth();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ 
        username: user?.username || '', 
        display_name: user?.display_name || '' 
    });
    
    // If username is the generated one (starts with @1...), clear it for better UX
    useEffect(() => {
        if (user) {
            let initialUsername = user.username || '';
            // If it looks like a generated ID (e.g. @11536...), clear it
            if (/^@\d+$/.test(initialUsername)) {
                initialUsername = '@';
            }
            setFormData({
                username: initialUsername,
                display_name: user.display_name || ''
            });
        }
    }, [user]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [usernameStatus, setUsernameStatus] = useState('idle'); // idle, checking, available, taken
    const [error, setError] = useState('');
    const [isUsernameFocused, setIsUsernameFocused] = useState(false);

    // Redirect if not logged in
    useEffect(() => {
        if (!user) navigate('/auth');
    }, [user, navigate]);

    // Debounce Username Check
    useEffect(() => {
        if (!formData.username || formData.username === '@') {
            setUsernameStatus('idle');
            return;
        }

        const rawUsername = formData.username.startsWith('@') ? formData.username.substring(1) : formData.username;
        
        // Basic format check
        if (rawUsername.length < 3 || rawUsername.length > 30 || !/^[a-zA-Z0-9_]+$/.test(rawUsername)) {
             setUsernameStatus('idle'); // Invalid format, don't check
             return;
        }

        setUsernameStatus('checking');
        const timer = setTimeout(async () => {
            try {
                const checkedName = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/check-username?username=${checkedName}`);
                const data = await res.json();
                setUsernameStatus(data.available ? 'available' : 'taken');
            } catch (err) {
                console.error(err);
                setUsernameStatus('idle');
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [formData.username]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        const rawUsername = formData.username.startsWith('@') ? formData.username.substring(1) : formData.username;
        const cleanUsername = `@${rawUsername}`;

        if (usernameStatus === 'taken') {
            setError('Username is taken');
            setIsSubmitting(false);
            return;
        }

        try {
            // 1. Update Username
            const userRes = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me/username`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ username: cleanUsername })
            });

            if (!userRes.ok) {
                const data = await userRes.json();
                throw new Error(data.error || 'Failed to update username');
            }

            // 2. Update Display Name
            const displayRes = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me/display-name`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ display_name: formData.display_name })
            });

            if (!displayRes.ok) {
                const data = await displayRes.json();
                throw new Error(data.error || 'Failed to update display name');
            }

            // Update local context
            updateUser({ username: cleanUsername, display_name: formData.display_name });

            // Next -> Dashboard
            navigate('/dashboard');

        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    if (!user) return <SpinLoading />;

    const rawUsername = formData.username.startsWith('@') ? formData.username.substring(1) : formData.username;
    // const validLength = rawUsername.length >= 3 && rawUsername.length <= 30;
    // const validChars = /^[a-zA-Z0-9_]+$/.test(rawUsername);

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-full mx-auto flex items-center justify-center mb-4 text-3xl font-bold text-white shadow-lg shadow-violet-500/30">
                        {formData.display_name ? formData.display_name[0]?.toUpperCase() : '?'}
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Welcome to Cipher!</h1>
                    <p className="text-slate-400">Let's set up your profile.</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center gap-3 mb-6">
                        <span className="material-symbols-outlined text-xl">error</span>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Display Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Display Name</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                className="w-full bg-slate-950 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500/50 border border-slate-800 focus:border-violet-500/50 transition-all placeholder:text-slate-600"
                                placeholder="Your Name"
                                value={formData.display_name}
                                onChange={e => setFormData({...formData, display_name: e.target.value})}
                                required
                            />
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">badge</span>
                        </div>
                    </div>

                    {/* Username */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                            <label className="text-sm font-medium text-slate-300">Username</label>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Cannot be changed later</span>
                        </div>
                        <div className="relative">
                            <input 
                                type="text" 
                                className={`w-full bg-slate-950 text-white rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:ring-2 border transition-all placeholder:text-slate-600 ${
                                    usernameStatus === 'available' ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' :
                                    usernameStatus === 'taken' ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' :
                                    'border-slate-800 focus:border-violet-500/50 focus:ring-violet-500/50'
                                }`}
                                placeholder="@username"
                                value={formData.username}
                                onChange={e => {
                                    let value = e.target.value.replace(/@/g, '');
                                    value = value.replace(/[^a-zA-Z0-9_]/g, '');
                                    setFormData({...formData, username: value ? '@' + value : '@'});
                                }}
                                onFocus={() => setIsUsernameFocused(true)}
                                onBlur={() => setIsUsernameFocused(false)}
                                required
                            />
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">person</span>
                            
                            {/* Status Icon */}
                             <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                {usernameStatus === 'checking' && <span className="material-symbols-outlined text-slate-500 animate-spin text-lg">progress_activity</span>}
                                {usernameStatus === 'available' && <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>}
                                {usernameStatus === 'taken' && <span className="material-symbols-outlined text-red-500 text-lg">cancel</span>}
                            </div>
                        </div>

                        {/* Checking/Rules UI */}
                         <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                            isUsernameFocused ? 'max-h-[300px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'
                        }`}>
                            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/50">
                                {[
                                    { label: '3-30 characters', valid: rawUsername.length >= 3 && rawUsername.length <= 30 },
                                    { label: 'Letters, numbers, underscores only', valid: /^[a-zA-Z0-9_]+$/.test(rawUsername) },
                                ].map((rule, i) => (
                                    <div key={i} className="flex items-center gap-3 text-xs transition-colors duration-200 mb-2 last:mb-0">
                                        <div className={`min-w-[5px] h-1.5 w-1.5 rounded-full shrink-0 ${
                                            rule.valid ? 'bg-green-400' : 'bg-slate-600'
                                        }`} />
                                        <span className={`${rule.valid ? 'text-green-400' : 'text-slate-400'}`}>
                                            {rule.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting || usernameStatus !== 'available' || !formData.display_name}
                        className={`w-full font-bold py-3.5 rounded-xl transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                            isSubmitting || usernameStatus !== 'available' || !formData.display_name
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-500/20 transform hover:scale-[1.01] active:scale-[0.99]'
                        }`}
                    >
                        {isSubmitting ? (
                            <>
                                <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                Saving Profile...
                            </>
                        ) : (
                            <>
                                Get Started
                                <span className="material-symbols-outlined text-lg">arrow_forward</span>
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}

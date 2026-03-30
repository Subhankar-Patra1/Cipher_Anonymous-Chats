import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SpinLoading from '../components/SpinLoading';
import { cryptoManager } from '../lib/crypto/CryptoManager';

export default function CompleteProfile() {
    const { user, updateUser, token, login, setNeedsOnboarding } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(1); // 1: Profile, 2: Backup
    
    // Profile State
    const [formData, setFormData] = useState({ 
        username: user?.username || '', 
        display_name: user?.display_name || '' 
    });
    
    // Backup State
    const [backupPassword, setBackupPassword] = useState('');
    const [confirmBackupPassword, setConfirmBackupPassword] = useState('');
    const [backupPasswordHint, setBackupPasswordHint] = useState('');
    const [showBackupPassword, setShowBackupPassword] = useState(false);

    // Common State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    
    // Profile Validation
    const [usernameStatus, setUsernameStatus] = useState('idle');
    const [isUsernameFocused, setIsUsernameFocused] = useState(false);

    // Initial Data Load
    useEffect(() => {
        if (user) {
            let initialUsername = user.username || '';
            if (/^@\d+$/.test(initialUsername)) initialUsername = '@';
            setFormData({
                username: initialUsername,
                display_name: user.display_name || ''
            });
        }
    }, [user]);

    // Redirect if not logged in
    useEffect(() => {
        if (!user) navigate('/auth');
    }, [user, navigate]);

    // Username Debounce (Step 1)
    useEffect(() => {
        if (step !== 1) return;
        if (!formData.username || formData.username === '@') {
            setUsernameStatus('idle');
            return;
        }

        const rawUsername = formData.username.startsWith('@') ? formData.username.substring(1) : formData.username;
        if (rawUsername.length < 3 || rawUsername.length > 30 || !/^[a-zA-Z0-9_]+$/.test(rawUsername)) {
             setUsernameStatus('idle');
             return;
        }

        setUsernameStatus('checking');
        const timer = setTimeout(async () => {
            try {
                const checkedName = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/check-username?username=${checkedName}`);
                const data = await res.json();
                // If it's OUR current username, it's available
                if (data.available || checkedName === user.username) {
                    setUsernameStatus('available');
                } else {
                    setUsernameStatus('taken');
                }
            } catch (err) {
                setUsernameStatus('idle');
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [formData.username, step, user?.username]);

    const handleProfileSubmit = async (e) => {
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
            await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL}/api/users/me/username`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ username: cleanUsername })
                }).then(r => { if (!r.ok) throw new Error('Failed to update username') }),
                
                fetch(`${import.meta.env.VITE_API_URL}/api/users/me/display-name`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ display_name: formData.display_name })
                }).then(r => { if (!r.ok) throw new Error('Failed to update display name') })
            ]);

            updateUser({ username: cleanUsername, display_name: formData.display_name });
            setStep(2); // Move to Backup Step
            setIsSubmitting(false);
        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    const handleBackupSubmit = async (e) => {
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
            // 1. Ensure keys exist
            await cryptoManager.init();
            // 2. Export keys
            const bundle = await cryptoManager.exportAllKeysSync();
            // 3. Encrypt
            const backup = await cryptoManager.encryptBackup(bundle, backupPassword);
            
            // 4. Upload
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...backup, passwordHint: backupPasswordHint.trim() || null })
            });

            if (!res.ok) throw new Error('Failed to upload backup');

            // 5. Enable auto-backup
            await cryptoManager.enableAutoBackup(backupPassword, backup.salt, token);

            // [FIX] Mark profile as completed on the server
            await fetch(`${import.meta.env.VITE_API_URL}/api/users/me/profile-completed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });

            // [FIX] Clear needsOnboarding so PrivateRoute allows dashboard access
            setNeedsOnboarding(false);

            // Done -> Show unique transition
            setIsSubmitting(false); // Stop spinner on button
            setStep(3); // 3: Entering Dashboard

            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);

        } catch (err) {
             console.error(err);
             setError(err.message || 'Failed to create backup');
             setIsSubmitting(false);
        }
    };

    if (!user) return <SpinLoading />;
    
    // Derived values for styling
    const rawUsername = formData.username.startsWith('@') ? formData.username.substring(1) : formData.username;

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl transition-all duration-500">
                {step === 3 ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-6 animate-in fade-in duration-500">
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
                    <>
                        <div className="text-center mb-8">
                            {step === 1 ? (
                                <>
                                    <div className="w-20 h-20 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-full mx-auto flex items-center justify-center mb-4 text-3xl font-bold text-white shadow-lg shadow-violet-500/30">
                                        {formData.display_name ? formData.display_name[0]?.toUpperCase() : '?'}
                                    </div>
                                    <h1 className="text-2xl font-bold text-white mb-2">Welcome to Cipher!</h1>
                                    <p className="text-slate-400">Let's set up your profile.</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-20 h-20 bg-slate-800 rounded-full mx-auto flex items-center justify-center mb-4 shadow-inner">
                                        <span className="material-symbols-outlined text-4xl text-emerald-500">lock</span>
                                    </div>
                                    <h1 className="text-2xl font-bold text-white mb-2">Secure Your Account</h1>
                                    <p className="text-slate-400 text-sm px-4">Create a backup password to recover your chats on other devices.</p>
                                </>
                            )}
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center gap-3 mb-6 animate-in slide-in-from-top-2">
                                <span className="material-symbols-outlined text-xl">error</span>
                                {error}
                            </div>
                        )}

                        {step === 1 ? (
                            <form onSubmit={handleProfileSubmit} className="space-y-6">
                                {/* INPUTS FOR STEP 1 (Username/Display Name) */}
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
                                            autoFocus
                                        />
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">badge</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-baseline">
                                        <label className="text-sm font-medium text-slate-300">Username</label>
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Unique ID</span>
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
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {usernameStatus === 'checking' && <span className="material-symbols-outlined text-slate-500 animate-spin text-lg">progress_activity</span>}
                                            {usernameStatus === 'available' && <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>}
                                            {usernameStatus === 'taken' && <span className="material-symbols-outlined text-red-500 text-lg">cancel</span>}
                                        </div>
                                    </div>
                                    
                                    {/* Rules */}
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
                                    {isSubmitting ? <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span> : 'Continue'}
                                    {!isSubmitting && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleBackupSubmit} className="space-y-4 animate-in slide-in-from-right-8 fade-in duration-300">
                                {/* INPUTS FOR STEP 2 (Backup Password) */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Create Backup Password</label>
                                    <div className="relative">
                                        <input
                                            type={showBackupPassword ? "text" : "password"}
                                            value={backupPassword}
                                            onChange={(e) => setBackupPassword(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                            placeholder="Strong password"
                                            required
                                            minLength={8}
                                            autoFocus
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
                                    {/* Mini validation */}
                                    <div className="mt-2 flex gap-4">
                                        <p className={`text-[10px] flex items-center gap-1.5 font-medium transition-colors ${backupPassword.length >= 8 ? 'text-emerald-500' : 'text-slate-500'}`}>
                                            <span className="material-symbols-outlined text-[12px]">{backupPassword.length >= 8 ? 'check' : 'circle'}</span> 8+ chars
                                        </p>
                                        <p className={`text-[10px] flex items-center gap-1.5 font-medium transition-colors ${/[0-9]/.test(backupPassword) ? 'text-emerald-500' : 'text-slate-500'}`}>
                                            <span className="material-symbols-outlined text-[12px]">{/[0-9]/.test(backupPassword) ? 'check' : 'circle'}</span> Number
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Confirm Password</label>
                                    <input
                                        type="password"
                                        value={confirmBackupPassword}
                                        onChange={(e) => setConfirmBackupPassword(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                        placeholder="Repeat password"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password Hint <span className="text-slate-600 normal-case tracking-normal">(Optional)</span></label>
                                    <input
                                        type="text"
                                        value={backupPasswordHint}
                                        onChange={(e) => setBackupPasswordHint(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
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
                                        <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                     ) : (
                                        <>
                                            Complete Setup
                                            <span className="material-symbols-outlined text-lg">check_circle</span>
                                        </>
                                     )}
                                </button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

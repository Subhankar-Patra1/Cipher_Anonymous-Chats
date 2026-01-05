import { useState, useEffect, useRef } from 'react';
import { useAppLock } from '../context/AppLockContext';
import { useAuth } from '../context/AuthContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

export default function LockScreen() {
    const { isLocked, unlockApp, removePasscode } = useAppLock();
    const { user, logout, loading } = useAuth(); // [FIX] Get logout and loading from context
    const [passcode, setPasscode] = useState(['', '', '', '']);
    const [error, setError] = useState(false);
    const [isShaking, setIsShaking] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false); // [NEW] Logout confirm state
    const inputRefs = useRef([]);

    // Reset on mount
    useEffect(() => {
        if (isLocked) {
             setPasscode(['', '', '', '']);
             // Focus only if not confirming logout
             if (!showLogoutConfirm) inputRefs.current[0]?.focus();
        }
    }, [isLocked, showLogoutConfirm]);

    const handleInput = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        
        const newPasscode = [...passcode];
        newPasscode[index] = value.slice(-1);
        setPasscode(newPasscode);
        setError(false);

        // Auto-advance
        if (value && index < 3) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit
        if (index === 3 && value) {
            const code = newPasscode.join('');
            setTimeout(() => handleSubmit(code), 100);
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !passcode[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleSubmit = async (code) => {
        const finalCode = typeof code === 'string' ? code : passcode.join('');
        
        const success = await unlockApp(finalCode);
        if (!success) {
            setError(true);
            setIsShaking(true);
            setPasscode(['', '', '', '']);
            inputRefs.current[0]?.focus();
            setTimeout(() => setIsShaking(false), 500);
        }
    };

    const handleLogout = () => {
        // [FIX] Clear passcode and lock state on logout so user isn't locked out on re-login
        removePasscode(); 
        
        logout(); // AuthContext handles redirect usually? Wait, checking AuthContext might be good but standard pattern is logout() updates user state -> redirects.
        // Or if AuthContext doesn't cleanup app lock, we might need to force reload.
        // Actually, AuthContext usually clears user. If we are wrapper in App.jsx, <PrivateRoute> will redirect.
        // But AppLock overrides everything with Z-Index. 
        // We should ensure AppLock is cleared too if logout happens.
        // AppLockContext methods (removePasscode) might be needed? 
        // Ideally logout clears localStorage/sessionStorage. 
        // Let's assume AuthContext clears token. 
        // We should probably explicitly close lock screen to be safe or reload.
        window.location.href = '/auth'; // Hard redirect to clear everything is safest for logout from lock screen
    };

    // [FIX] If session is expired (not loading AND no user), do not show lock screen
    // This prevents the "Enter Passcode -> Landing Page" flow
    // If we are NOT loading and NOT logged in, we should bypass the lock screen
    // The lock screen is only relevant for protecing an ACTIVE session.
    if (!loading && !user) return null;

    if (!isLocked) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#2a3e59] via-slate-950 to-black flex flex-col items-center justify-center p-4 h-[100dvh] touch-none animate-fade-in backdrop-blur-xl">
            <div className={`w-full max-w-sm flex flex-col items-center gap-8 ${isShaking ? 'animate-shake' : ''}`}>
                
                {/* User Info */}
                <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-br from-violet-500 to-indigo-600 shadow-2xl">
                        {user?.avatar_url ? (
                            <img src={user.avatar_url} alt="User" className="w-full h-full rounded-full object-cover border-4 border-slate-900" />
                        ) : (
                            <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-3xl font-bold text-white border-4 border-slate-900">
                                {user?.display_name?.[0]}
                            </div>
                        )}
                    </div>
                    <h2 className="text-xl font-bold text-white">
                        {user?.display_name ? renderTextWithEmojis(user.display_name, '1.1em') : 'Welcome Back'}
                    </h2>
                    <p className="text-slate-400 text-sm">Enter passcode to unlock</p>
                </div>

                {/* Passcode Inputs */}
                <div className={`flex gap-4 sm:gap-6 ${error ? 'animate-shake' : ''}`}>
                    {passcode.map((digit, i) => (
                        <input
                            key={i}
                            ref={el => inputRefs.current[i] = el}
                            type="password"
                            inputMode="numeric"
                            value={digit}
                            onChange={(e) => handleInput(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-800 border-2 text-center text-2xl font-bold text-white focus:outline-none transition-all ${
                                error 
                                ? 'border-red-500 focus:border-red-500' 
                                : 'border-slate-700 focus:border-violet-500 focus:shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                            }`}
                        />
                    ))}
                </div>
                
                {error && (
                    <p className="text-red-500 font-medium animate-bounce">Incorrect passcode</p>
                )}

                {/* [NEW] Logout Text */}
                <p className="text-slate-500 text-sm mt-4 text-center">
                    Note: if you forget your passcode, you'll need to <button onClick={() => setShowLogoutConfirm(true)} className="text-violet-500 hover:text-violet-400 font-bold underline decoration-violet-500/30 underline-offset-4 transition-colors">logout</button>.
                </p>
            </div>

            {/* [NEW] Logout Confirmation Modal directly in LockScreen */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1e1e1e] rounded-[28px] p-6 w-full max-w-sm shadow-2xl border border-white/10">
                        <h3 className="text-xl font-bold text-white mb-2">Log out</h3>
                        <p className="text-slate-300 text-sm mb-6">Are you sure you want to log out?</p>
                        
                        <div className="flex justify-end gap-2 font-bold text-sm">
                            <button 
                                onClick={() => setShowLogoutConfirm(false)}
                                className="px-4 py-2 rounded-full text-[#8b9eff] hover:text-[#a0b0ff] hover:bg-white/5 transition-all"
                            >
                                CANCEL
                            </button>
                            <button 
                                onClick={handleLogout}
                                className="px-4 py-2 rounded-full text-[#ff6b6b] hover:text-[#ff8585] hover:bg-red-500/10 transition-all"
                            >
                                LOG OUT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-10px); }
                    75% { transform: translateX(10px); }
                }
                .animate-shake {
                    animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both;
                }
                @keyframes fade-in {
                    from { opacity: 0; backdrop-filter: blur(0px); }
                    to { opacity: 1; backdrop-filter: blur(12px); }
                }
                .animate-fade-in {
                    animation: fade-in 0.4s ease-out forwards;
                }
            `}</style>
        </div>
    );
}

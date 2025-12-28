import { useState, useEffect, useRef } from 'react';
import { useChatLock } from '../context/ChatLockContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

/**
 * Unlock screen for locked chats - shown in right panel
 * Shows when user tries to open a locked chat
 */
export default function ChatUnlockScreen({ room, onUnlock, onCancel }) {
    const { verifyPasscode, removeLock } = useChatLock();
    const [passcode, setPasscode] = useState(['', '', '', '']);
    const [error, setError] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isShaking, setIsShaking] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [showForgotPin, setShowForgotPin] = useState(false);
    const [accountPassword, setAccountPassword] = useState('');
    const [isRemoving, setIsRemoving] = useState(false);
    const inputRefs = useRef([]);

    // Focus first input on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            inputRefs.current[0]?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const handleInput = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        
        const newPasscode = [...passcode];
        newPasscode[index] = value.slice(-1);
        setPasscode(newPasscode);
        setError(false);
        setErrorMessage('');

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
        if (e.key === 'Escape') {
            onCancel();
        }
    };

    const handleSubmit = async (code) => {
        const finalCode = typeof code === 'string' ? code : passcode.join('');
        
        if (finalCode.length < 4) return;
        
        const result = await verifyPasscode(room.id, finalCode);
        
        if (result.success) {
            onUnlock();
        } else {
            setError(true);
            setErrorMessage(result.error || 'Incorrect passcode');
            setIsShaking(true);
            setPasscode(['', '', '', '']);
            setAttempts(prev => prev + 1);
            inputRefs.current[0]?.focus();
            setTimeout(() => setIsShaking(false), 500);
        }
    };

    const handleForgotPin = async () => {
        if (!accountPassword) {
            setErrorMessage('Please enter your account password');
            return;
        }
        
        setIsRemoving(true);
        const result = await removeLock(room.id, accountPassword, true);
        setIsRemoving(false);
        
        if (result.success) {
            onUnlock();
        } else {
            setErrorMessage(result.error || 'Incorrect password');
        }
    };

    // Get display name for chat
    const chatName = room.type === 'direct' 
        ? (room.other_user_name || room.name || 'Private Chat')
        : (room.name || 'Group Chat');

    // Get avatar initial
    const avatarInitial = chatName?.[0]?.toUpperCase() || '?';

    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#2a3e59] via-slate-950 to-black p-4 touch-none animate-in fade-in duration-200">
            
            {/* Back Button */}
            <button 
                onClick={onCancel}
                className="absolute top-4 left-4 sm:top-6 sm:left-6 p-2 rounded-full hover:bg-white/10 transition-colors group md:hidden"
            >
                <svg className="w-6 h-6 text-slate-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </button>

            {!showForgotPin ? (
                <div className={`w-full max-w-sm flex flex-col items-center gap-8 ${isShaking ? 'animate-shake' : ''}`}>
                    
                    {/* Chat Info */}
                    <div className="flex flex-col items-center gap-4">
                        {/* Lock Icon Badge */}
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-br from-amber-500 to-orange-600 shadow-2xl">
                                {room.avatar_url || room.avatar_thumb_url ? (
                                    <img 
                                        src={room.avatar_url || room.avatar_thumb_url} 
                                        alt={chatName} 
                                        className="w-full h-full rounded-full object-cover border-4 border-slate-900" 
                                    />
                                ) : (
                                    <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-3xl font-bold text-white border-4 border-slate-900">
                                        {avatarInitial}
                                    </div>
                                )}
                            </div>
                            {/* Lock badge */}
                            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shadow-lg border-2 border-slate-900">
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </div>
                        
                        <h2 className="text-xl font-bold text-white text-center line-clamp-1">
                            {renderTextWithEmojis(chatName)}
                        </h2>
                        <p className="text-slate-400 text-sm">Enter passcode to view this chat</p>
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
                                    : 'border-slate-700 focus:border-amber-500 focus:shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                                }`}
                            />
                        ))}
                    </div>
                    
                    {error && (
                        <p className="text-red-500 font-medium animate-bounce">{errorMessage}</p>
                    )}

                    {/* Forgot PIN link - show prominently after 3 attempts */}
                    <div className="text-center">
                        {attempts >= 3 ? (
                            <button 
                                onClick={() => setShowForgotPin(true)}
                                className="px-6 py-3 bg-amber-500/20 text-amber-400 rounded-xl font-medium hover:bg-amber-500/30 transition-colors"
                            >
                                Forgot PIN? Use account password
                            </button>
                        ) : (
                            <button 
                                onClick={() => setShowForgotPin(true)}
                                className="text-slate-500 text-sm hover:text-slate-400 transition-colors"
                            >
                                Forgot PIN?
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                /* Forgot PIN Flow */
                <div className="w-full max-w-sm flex flex-col items-center gap-6">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-2">
                            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white">Forgot PIN</h2>
                        <p className="text-slate-400 text-sm text-center">
                            Enter your account password to remove the lock from this chat.
                        </p>
                    </div>

                    <div className="w-full">
                        <input
                            type="password"
                            placeholder="Account password"
                            value={accountPassword}
                            onChange={(e) => {
                                setAccountPassword(e.target.value);
                                setErrorMessage('');
                            }}
                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                            autoFocus
                        />
                        {errorMessage && (
                            <p className="text-red-500 text-sm mt-2">{errorMessage}</p>
                        )}
                    </div>

                    <div className="flex gap-3 w-full">
                        <button
                            onClick={() => {
                                setShowForgotPin(false);
                                setAccountPassword('');
                                setErrorMessage('');
                            }}
                            className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleForgotPin}
                            disabled={isRemoving || !accountPassword}
                            className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isRemoving ? 'Removing...' : 'Remove Lock'}
                        </button>
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
            `}</style>
        </div>
    );
}

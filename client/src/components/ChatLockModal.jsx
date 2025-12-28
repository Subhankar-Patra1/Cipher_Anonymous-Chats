import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useChatLock } from '../context/ChatLockContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

/**
 * Modal for setting, changing, or removing a chat lock
 */
export default function ChatLockModal({ room, onClose, onLockSet }) {
    const { isRoomLocked, lockRoom, removeLock } = useChatLock();
    const isLocked = isRoomLocked(room.id);
    
    const [step, setStep] = useState(isLocked ? 'menu' : 'set'); // 'menu', 'set', 'confirm', 'verify', 'remove'
    const [passcode, setPasscode] = useState(['', '', '', '']);
    const [confirmPasscode, setConfirmPasscode] = useState(['', '', '', '']);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const inputRefs = useRef([]);
    const confirmInputRefs = useRef([]);

    useEffect(() => {
        // Focus first input when step changes
        const timer = setTimeout(() => {
            if (step === 'set' || step === 'verify') {
                inputRefs.current[0]?.focus();
            } else if (step === 'confirm') {
                confirmInputRefs.current[0]?.focus();
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [step]);

    const handleInput = (refs, index, value, code, setCode, onComplete) => {
        if (!/^\d*$/.test(value)) return;
        
        const newCode = [...code];
        newCode[index] = value.slice(-1);
        setCode(newCode);
        setError('');

        // Auto-advance
        if (value && index < 3) {
            refs.current[index + 1]?.focus();
        }

        // Auto-submit on last digit
        if (index === 3 && value) {
            setTimeout(() => onComplete(newCode.join('')), 100);
        }
    };

    const handleKeyDown = (refs, index, e, code) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            refs.current[index - 1]?.focus();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    const handleSetComplete = (code) => {
        if (code.length < 4) return;
        setStep('confirm');
    };

    const handleConfirmComplete = async (code) => {
        const originalCode = passcode.join('');
        
        if (code !== originalCode) {
            setError('Passcodes do not match');
            setConfirmPasscode(['', '', '', '']);
            confirmInputRefs.current[0]?.focus();
            return;
        }

        setIsLoading(true);
        const result = await lockRoom(room.id, code);
        setIsLoading(false);

        if (result.success) {
            if (onLockSet) onLockSet(room.id);
            onClose();
        } else {
            setError(result.error || 'Failed to set lock');
        }
    };

    const handleVerifyComplete = async (code) => {
        setIsLoading(true);
        const result = await removeLock(room.id, code, false);
        setIsLoading(false);

        if (result.success) {
            onClose();
        } else {
            setError(result.error || 'Incorrect passcode');
            setPasscode(['', '', '', '']);
            inputRefs.current[0]?.focus();
        }
    };

    const renderPinInputs = (refs, code, setCode, onComplete) => (
        <div className="flex gap-3 sm:gap-4 justify-center">
            {code.map((digit, i) => (
                <input
                    key={i}
                    ref={el => refs.current[i] = el}
                    type="password"
                    inputMode="numeric"
                    value={digit}
                    onChange={(e) => handleInput(refs, i, e.target.value, code, setCode, onComplete)}
                    onKeyDown={(e) => handleKeyDown(refs, i, e, code)}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-800 border-2 text-center text-xl font-bold text-white focus:outline-none transition-all ${
                        error 
                        ? 'border-red-500' 
                        : 'border-slate-700 focus:border-amber-500'
                    }`}
                />
            ))}
        </div>
    );

    const chatName = room.type === 'direct' 
        ? (room.other_user_name || room.name || 'Private Chat')
        : (room.name || 'Group Chat');

    return createPortal(
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-800 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        Chat Lock
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-slate-800 transition-colors"
                    >
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
                    {/* Menu for locked chats */}
                    {step === 'menu' && (
                        <div className="flex flex-col gap-4">
                            <p className="text-slate-400 text-sm text-center mb-2">
                                <span className="font-medium text-amber-400">{renderTextWithEmojis(chatName)}</span> is currently locked
                            </p>
                            
                            <button
                                onClick={() => {
                                    setStep('set');
                                    setPasscode(['', '', '', '']);
                                    setConfirmPasscode(['', '', '', '']);
                                }}
                                className="flex items-center gap-3 p-4 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors text-left"
                            >
                                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium text-white">Change PIN</p>
                                    <p className="text-slate-400 text-sm">Set a new passcode</p>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setStep('verify');
                                    setPasscode(['', '', '', '']);
                                }}
                                className="flex items-center gap-3 p-4 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors text-left"
                            >
                                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium text-white">Remove Lock</p>
                                    <p className="text-slate-400 text-sm">Unlock this chat permanently</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Set new PIN */}
                    {step === 'set' && (
                        <div className="flex flex-col items-center gap-6">
                            <div className="text-center">
                                <p className="text-white font-medium mb-1">Set a 4-digit PIN</p>
                                <p className="text-slate-400 text-sm">This will lock "{renderTextWithEmojis(chatName)}"</p>
                            </div>

                            {renderPinInputs(inputRefs, passcode, setPasscode, handleSetComplete)}

                            {error && (
                                <p className="text-red-500 text-sm">{error}</p>
                            )}
                        </div>
                    )}

                    {/* Confirm new PIN */}
                    {step === 'confirm' && (
                        <div className="flex flex-col items-center gap-6">
                            <div className="text-center">
                                <p className="text-white font-medium mb-1">Confirm your PIN</p>
                                <p className="text-slate-400 text-sm">Enter the same PIN again</p>
                            </div>

                            {renderPinInputs(confirmInputRefs, confirmPasscode, setConfirmPasscode, handleConfirmComplete)}

                            {error && (
                                <p className="text-red-500 text-sm">{error}</p>
                            )}

                            {isLoading && (
                                <div className="flex items-center gap-2 text-slate-400">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span className="text-sm">Setting lock...</span>
                                </div>
                            )}

                            <button
                                onClick={() => {
                                    setStep('set');
                                    setPasscode(['', '', '', '']);
                                    setConfirmPasscode(['', '', '', '']);
                                    setError('');
                                }}
                                className="text-slate-400 text-sm hover:text-slate-300 transition-colors"
                            >
                                ← Go back
                            </button>
                        </div>
                    )}

                    {/* Verify to remove */}
                    {step === 'verify' && (
                        <div className="flex flex-col items-center gap-6">
                            <div className="text-center">
                                <p className="text-white font-medium mb-1">Enter current PIN</p>
                                <p className="text-slate-400 text-sm">To remove the lock from this chat</p>
                            </div>

                            {renderPinInputs(inputRefs, passcode, setPasscode, handleVerifyComplete)}

                            {error && (
                                <p className="text-red-500 text-sm">{error}</p>
                            )}

                            {isLoading && (
                                <div className="flex items-center gap-2 text-slate-400">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span className="text-sm">Removing lock...</span>
                                </div>
                            )}

                            <button
                                onClick={() => {
                                    setStep('menu');
                                    setPasscode(['', '', '', '']);
                                    setError('');
                                }}
                                className="text-slate-400 text-sm hover:text-slate-300 transition-colors"
                            >
                                ← Go back
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppLock } from '../context/AppLockContext';

export default function PasscodeSettingsModal({ onClose }) {
    const { hasPasscode, setPasscode, removePasscode, autoLockDuration, setAutoLock, verifyPasscode } = useAppLock();
    // Steps: menu, verify_old, setup, confirm_new, confirm_disable
    const [step, setStep] = useState(hasPasscode ? 'menu' : 'setup'); 
    const [tempCode, setTempCode] = useState('');
    const [code, setCode] = useState(['', '', '', '']); // General input state
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    
    const inputRefs = useRef([]);

    // Clear inputs when step changes
    useEffect(() => {
        setCode(['', '', '', '']);
        setError('');
        setShake(false);
        setTimeout(() => {
            if (['verify_old', 'setup', 'confirm_new'].includes(step)) {
                inputRefs.current[0]?.focus();
            }
        }, 100);
    }, [step]);

    const handleInput = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        
        const newVals = [...code];
        newVals[index] = value.slice(-1);
        setCode(newVals);
        setError('');

         // Auto-advance
        if (value && index < 3) {
            inputRefs.current[index + 1]?.focus();
        }
        
        // Check completion
        if (index === 3 && value) {
             const fullCode = newVals.join('');
             if (fullCode.length === 4) {
                 setTimeout(() => handleComplete(fullCode), 100);
             }
        }
    };
    
    const handleKeyDown = (index, e) => {
         if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleComplete = async (fullCode) => {
        if (step === 'verify_old') {
            const isValid = await verifyPasscode(fullCode);
            if (isValid) {
                setStep('setup');
            } else {
                handleError();
            }
        } else if (step === 'setup') {
            setTempCode(fullCode);
            setStep('confirm_new');
        } else if (step === 'confirm_new') {
            if (fullCode === tempCode) {
                setPasscode(fullCode);
                onClose();
            } else {
                handleError('Passcodes do not match. Try again.');
                setStep('setup'); // Restart setup
            }
        }
    };
    
    const handleError = (msg = 'Incorrect passcode') => {
        setError(msg);
        setShake(true);
        setCode(['', '', '', '']);
        inputRefs.current[0]?.focus();
        setTimeout(() => setShake(false), 500);
    };
    // [FIX] Use step for confirmation instead of immediate action
    const handleTurnOff = () => {
         setStep('confirm_disable');
    };

    const renderInputs = () => (
        <div className={`flex gap-4 mb-6 ${shake ? 'animate-shake' : ''}`}>
             {code.map((digit, i) => (
                <input
                    key={i}
                    ref={el => inputRefs.current[i] = el}
                    type="password"
                    inputMode="numeric"
                    value={digit}
                    onChange={(e) => handleInput(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={`w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 border-[1.5px] text-center text-xl font-bold text-slate-900 dark:text-white focus:outline-none transition-all ${
                        error ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-slate-300 dark:border-slate-600 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10'
                    }`}
                />
            ))}
        </div>
    );

    const autoLockContent = (
         <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
             <h3 className="text-center font-bold text-slate-800 dark:text-white mb-4">Auto-Lock Timer</h3>
             <div className="space-y-2">
                 {[null, 1, 5, 10, 15, 30].map(duration => (
                     <button
                        key={String(duration)}
                        onClick={() => {
                            setAutoLock(duration);
                            setStep('menu');
                        }}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all flex justify-between items-center ${
                            autoLockDuration === duration 
                            ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' 
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                     >
                         <span className="font-medium">{duration ? `${duration} minute${duration > 1 ? 's' : ''}` : 'Disabled'}</span>
                         {autoLockDuration === duration && <span className="material-symbols-outlined text-sm">check</span>}
                     </button>
                 ))}
             </div>
         </div>
    );

    const menuContent = (
        <div className="w-full space-y-1 animate-in fade-in duration-300">
             <div className="flex flex-col items-center mb-6">
                 <div className="w-20 h-20 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-[40px] text-violet-500">lock</span>
                 </div>
                 
                 <button
                    onClick={handleTurnOff} 
                    className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-700 dark:text-slate-300"
                 >
                    <span className="material-symbols-outlined">no_encryption</span>
                    <span className="font-medium">Turn Passcode Off</span>
                 </button>
                 
                 <button
                    onClick={() => setStep('verify_old')} 
                    className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-700 dark:text-slate-300 mb-4"
                 >
                    <span className="material-symbols-outlined">key</span>
                    <span className="font-medium">Change passcode</span>
                 </button>

                 <div className="w-full bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 mb-4">
                     <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                         When a passcode is set, a lock icon appears above your chat list. Tap it to lock your Cipher.
                     </p>
                     <p className="text-xs text-slate-500 dark:text-slate-500 italic">
                         Note: If you forget your passcode, you'll need to log out.
                     </p>
                 </div>

                 {/* [FIX] Auto Lock Settings - Submenu to avoid overflow */}
                 <div className="w-full">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block px-1">Auto-lock after</label>
                     <button 
                        onClick={() => setStep('select_autolock')}
                        className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 group hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                     >
                         <span>{autoLockDuration ? `${autoLockDuration} min` : 'Disabled'}</span>
                         <span className="material-symbols-outlined text-slate-400 group-hover:translate-x-1 transition-transform">chevron_right</span>
                     </button>
                 </div>
             </div>
        </div>
    );

    const inputScreen = (title, subtitle) => (
        <div className="w-full flex flex-col items-center animate-in fade-in duration-300">
             <div className="w-16 h-16 mb-6 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center text-violet-600 dark:text-violet-400">
                 <span className="material-symbols-outlined text-3xl">{step === 'verify_old' ? 'lock' : 'lock_open'}</span>
             </div>
             
             <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{title}</h3>
             <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">{subtitle}</p>

             {renderInputs()}

             {error && <p className="text-red-500 text-sm font-medium mb-4 animate-bounce">{error}</p>}
        </div>
    );
    
    // Determine content based on step
    let content;
    if (step === 'menu') {
        content = menuContent;
    } else if (step === 'select_autolock') {
        content = autoLockContent;
    } else if (step === 'verify_old') {
        content = inputScreen('Enter Current Passcode', 'Please verify your identity');
    } else if (step === 'setup') {
        content = inputScreen('Create a Passcode', 'Enter a 4-digit code');
    } else if (step === 'confirm_new') {
        content = inputScreen('Confirm Passcode', 'Re-enter your new code');
    }

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
             <div 
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col animate-scale-up relative transition-all duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 flex items-center gap-3 absolute top-0 left-0 w-full z-10">
                    <button 
                        onClick={() => {
                            if (['select_autolock', 'verify_old'].includes(step)) {
                                setStep('menu');
                            } else if (step === 'confirm_new') {
                                setStep('setup');
                            } else if (step === 'setup' && hasPasscode) {
                                setStep('menu');
                             } else {
                                onClose();
                            }
                        }} 
                        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <span className="font-bold text-lg text-slate-800 dark:text-white opacity-0">Passcode</span> {/* Hidden for spacer */}
                </div>
                
                {/* Real content container */}
                <div className="pt-16 px-6 pb-8">
                     {step !== 'menu' && (
                         <h2 className="text-center font-bold text-lg mb-4 absolute top-4 left-0 w-full pointer-events-none text-slate-800 dark:text-white">
                             Passcode
                         </h2>
                     )}
                     
                    {content}
                </div>
                
                {/* Confirm Turn Off Modal Overlay */}
                {step === 'confirm_disable' && createPortal(
                    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-[#1e1e1e] rounded-[28px] p-6 w-full max-w-sm shadow-2xl border border-slate-200 dark:border-white/10">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">Turn Passcode Off?</h3>
                            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 text-center">
                                Are you sure you want to turn passcode off? <br/>
                                Anyone with access to your device can verify your messages.
                            </p>
                            
                            <div className="flex justify-end gap-2 font-bold text-sm">
                                <button 
                                    onClick={() => setStep('menu')}
                                    className="px-4 py-2 rounded-full text-[#8b9eff] hover:text-[#a0b0ff] hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                                >
                                    CANCEL
                                </button>
                                <button 
                                    onClick={() => {
                                        removePasscode();
                                        onClose();
                                    }}
                                    className="px-4 py-2 rounded-full text-[#ff6b6b] hover:text-[#ff8585] hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                                >
                                    TURN OFF
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
            
             <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-6px); }
                    75% { transform: translateX(6px); }
                }
                .animate-shake {
                    animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both;
                }
            `}</style>
        </div>,
        document.body
    );
}

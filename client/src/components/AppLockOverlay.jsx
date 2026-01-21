import React, { useEffect, useState } from 'react';
import { useAppLock } from '../context/AppLockContext';

export default function AppLockOverlay() {
    const { isLocked, unlock, isEnabled, hasPasscode, verifyPasscode } = useAppLock();
    const [render, setRender] = useState(isLocked);
    const [exiting, setExiting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isError, setIsError] = useState(false);
    // [FIX] Default to passcode if locked but biometrics disabled, otherwise prefer biometrics
    const [showPasscode, setShowPasscode] = useState(!isEnabled && hasPasscode); 
    
    // Passcode State
    const [code, setCode] = useState(['', '', '', '']);
    const [shake, setShake] = useState(false);
    const inputRefs = React.useRef([]);

    // Clear state on close or reset
    useEffect(() => {
        if (!render) {
            // Reset to default state when closed
            setShowPasscode(!isEnabled && hasPasscode);
            setCode(['', '', '', '']);
            setIsError(false);
        }
    }, [render, isEnabled, hasPasscode]);

    // Focus first input when showing passcode
    useEffect(() => {
        if (showPasscode && render) {
            setTimeout(() => {
                inputRefs.current[0]?.focus();
            }, 50);
        }
    }, [showPasscode, render]);

    // Passcode Logic
    const handleInput = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        
        const newVals = [...code];
        newVals[index] = value.slice(-1);
        setCode(newVals);
        
        if (value && index < 3) {
            inputRefs.current[index + 1]?.focus();
        }

        if (index === 3 && value) {
            const fullCode = newVals.join('');
            if (fullCode.length === 4) {
                setTimeout(() => handlePasscodeSubmit(fullCode), 100);
            }
        }
    };
    
    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePasscodeSubmit = async (fullCode) => {
        if (verifyPasscode(fullCode)) {
             await unlock('passcode'); // [FIX] Actually trigger unlock in context
             setIsSuccess(true);
        } else {
             setShake(true);
             setCode(['', '', '', '']);
             inputRefs.current[0]?.focus();
             setTimeout(() => setShake(false), 500);
        }
    };

    const handleUnlock = async () => {
        if (isVerifying) return;
        setIsVerifying(true);
        setIsError(false);
        
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Auth Timeout')), 62000); 
        });

        try {
            const success = await Promise.race([
                unlock(),
                timeoutPromise
            ]);
            clearTimeout(timeoutId);

            if (mounted.current) {
                 if (!success) {
                     setIsError(true);
                     setTimeout(() => { if (mounted.current) setIsError(false); }, 2000);
                 }
            }
        } catch (error) {
            if (mounted.current) {
                setIsError(true);
                setTimeout(() => { if (mounted.current) setIsError(false); }, 2000);
            }
        } finally {
            if (mounted.current) {
                setIsVerifying(false);
            }
            clearTimeout(timeoutId);
        }
    };

    const mounted = React.useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    });

    useEffect(() => {
        if (isLocked) {
             document.documentElement.classList.add('locked-no-scroll');
        } else {
             document.documentElement.classList.remove('locked-no-scroll');
        }
        return () => {
             document.documentElement.classList.remove('locked-no-scroll');
        };
    }, [isLocked]);

    useEffect(() => {
        if (isLocked) {
             if (!render) setRender(true);
             if (exiting) setExiting(false);
             if (isSuccess) setIsSuccess(false);
             if (isVerifying) setIsVerifying(false); 
             if (isError) setIsError(false);
        } else if (render) {
             if (!isSuccess && !exiting) {
                 setIsSuccess(true);
             } else if (isSuccess && !exiting) {
                 const timer = setTimeout(() => {
                     setExiting(true);
                 }, 300);
                 return () => clearTimeout(timer);
             } else if (exiting) {
                 const timer = setTimeout(() => {
                     setRender(false);
                     setExiting(false);
                     setIsSuccess(false);
                 }, 350);
                 return () => clearTimeout(timer);
             }
        }
    }, [isLocked, unlock, render, exiting, isSuccess]);

    if (!render) return null;

    const displayingSuccess = isSuccess || (!isLocked && render && !exiting);
    let iconName = 'fingerprint';
    let titleText = 'Cipher Locked';
    let subText = 'Authentication required to access your authenticated session.';
    let buttonText = 'Unlock Now';
    let buttonIcon = 'lock_open';
    const isBusy = isVerifying && !displayingSuccess;

    if (displayingSuccess) {
        iconName = 'lock_open';
        titleText = 'Unlocked';
        subText = 'Welcome back.';
        buttonText = 'Success';
        buttonIcon = 'check';
    } else if (isBusy) {
        iconName = 'progress_activity'; 
        titleText = 'Verifying...';
        subText = 'Complete the security prompt to continue.';
        buttonText = 'Waiting...'; 
        buttonIcon = 'hourglass_empty'; 
    } else if (isError) {
        iconName = 'error';
        titleText = 'Authentication Failed';
        subText = 'Please try again.';
        buttonText = 'Retry Unlock';
        buttonIcon = 'refresh';
    } else if (showPasscode) {
        iconName = 'dialpad'; // Changed icon for better context
        titleText = 'Enter Passcode';
        subText = 'Enter your 4-digit Chat Lock Code';
        buttonText = 'Use Biometrics';
        buttonIcon = 'fingerprint';
    }

    const isTyping = code.some(digit => digit !== '');

    return (
        <div 
            className={`fixed inset-0 z-[9999] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 text-center transition-all duration-300 ease-out transform ${exiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'}`}
        >
            <div className={`bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 max-w-sm w-full mx-auto transform transition-all duration-300 ease-out ${exiting ? 'translate-y-10 opacity-0' : 'translate-y-0 opacity-100'} ${isError || shake ? 'animate-shake' : ''}`}>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 transition-all duration-100 ${displayingSuccess ? 'bg-emerald-500/20 scale-110' : (isError || shake ? 'bg-red-500/20' : (isBusy ? 'bg-violet-600/10' : 'bg-violet-600/20 animate-pulse-slow'))}`}>
                    <span 
                        className={`material-symbols-outlined text-4xl transition-all duration-100 ${displayingSuccess ? 'text-emerald-400 scale-110' : (isError || shake ? 'text-red-400' : 'text-violet-400')} ${isBusy ? 'animate-spin' : ''}`}
                    >
                        {iconName}
                    </span>
                </div>
                
                <h2 className={`text-2xl font-bold mb-2 transition-all duration-100 ${isError || shake ? 'text-red-400' : 'text-white'}`}>{titleText}</h2>
                <p className="text-slate-400 mb-8 transition-all duration-100">{subText}</p>

                {showPasscode && !displayingSuccess ? (
                    <div className="flex justify-center gap-4 mb-8">
                         {code.map((digit, i) => (
                            <input
                                key={i}
                                ref={el => inputRefs.current[i] = el}
                                type="password"
                                inputMode="numeric"
                                value={digit}
                                onChange={(e) => handleInput(i, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(i, e)}
                                disabled={displayingSuccess}
                                className={`w-12 h-12 rounded-full bg-slate-900 border-[1.5px] text-center text-xl font-bold text-white focus:outline-none transition-all caret-transparent ${
                                    shake ? 'border-red-500 bg-red-900/10' : 'border-slate-600 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10'
                                }`}
                            />
                        ))}
                    </div>
                ) : null}

                {/* Show main Biometric Unlock button ONLY if NOT showing passcode interface */}
                {!showPasscode && (
                    <button 
                        onClick={handleUnlock}
                        disabled={displayingSuccess || isBusy}
                        className={`w-full py-3.5 px-6 rounded-xl font-semibold shadow-lg transition-all duration-100 active:scale-95 flex items-center justify-center gap-2 mb-3 ${displayingSuccess ? 'bg-emerald-600 text-white shadow-emerald-500/20' : (isError ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20' : (isBusy ? 'bg-slate-700 text-slate-300' : 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-500/20'))}`}
                    >
                        <span className="material-symbols-outlined">{buttonIcon}</span>
                        {buttonText}
                    </button>
                )}

                {/* Show Toggle Button IF user has both methods enabled AND is not currently authenticating */}
                {isEnabled && hasPasscode && !displayingSuccess && !isVerifying && !isTyping && (
                     <button 
                        onClick={() => setShowPasscode(!showPasscode)}
                        className="w-full py-3 px-6 rounded-xl font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                    >
                        {showPasscode ? (
                            <>
                                <span className="material-symbols-outlined text-[18px]">fingerprint</span>
                                Use Biometrics
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">keyboard</span>
                                Use Passcode
                            </>
                        )}
                    </button>
                )}
            </div>
            
            <div className={`absolute bottom-8 text-slate-500 text-sm font-mono flex items-center gap-2 transition-opacity duration-300 ${exiting ? 'opacity-0' : 'opacity-100'}`}>
                <span className="material-symbols-outlined text-base">encrypted</span>
                Secured by WebAuthn
            </div>
        </div>
    );
}

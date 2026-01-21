import React, { createContext, useContext, useState, useEffect } from 'react';

const AppLockContext = createContext();

export const useAppLock = () => useContext(AppLockContext);

export const AppLockProvider = ({ children }) => {
    const [isEnabled, setIsEnabled] = useState(() => {
        return localStorage.getItem('app_lock_enabled') === 'true';
    });
    
    // Default to locked if either biometric OR passcode lock is on
    const [isLocked, setIsLocked] = useState(() => {
        const lockEnabled = localStorage.getItem('app_lock_enabled') === 'true';
        const hasPasscode = !!localStorage.getItem('app_passcode');
        return lockEnabled || hasPasscode;
    });

    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        // Check if WebAuthn is supported
        if (window.PublicKeyCredential) {
            PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
                .then(available => {
                    setIsSupported(available);
                })
                .catch(err => console.error("WebAuthn check failed", err));
        }
    }, []);

    const enableLock = async () => {
        if (!isSupported) {
            alert("Your device does not support biometric authentication or it is not set up.");
            return false;
        }

        try {
            const success = await authenticateUser("Enable App Lock");
            if (success) {
                setIsEnabled(true);
                localStorage.setItem('app_lock_enabled', 'true');
                return true;
            }
        } catch (err) {
            console.error("Authentication failed", err);
            alert("Authentication failed. Please try again.");
        }
        return false;
    };

    const disableLock = async () => {
        try {
            const success = await authenticateUser("Disable App Lock");
            if (success) {
                setIsEnabled(false);
                setIsLocked(false);
                localStorage.removeItem('app_lock_enabled');
                return true;
            }
        } catch (err) {
            console.error("Authentication failed", err);
        }
        return false;
    };

    const [passcode, _setPasscode] = useState(() => localStorage.getItem('app_passcode'));
    const hasPasscode = !!passcode;
    
    const [autoLockDuration, setAutoLock] = useState(() => {
        const val = localStorage.getItem('auto_lock_duration');
        return val ? parseInt(val) : null;
    });

    const setPasscode = (code) => {
        localStorage.setItem('app_passcode', code);
        _setPasscode(code);
    };

    const removePasscode = () => {
        localStorage.removeItem('app_passcode');
        _setPasscode(null);
        setIsEnabled(false);
        setIsLocked(false);
        localStorage.removeItem('app_lock_enabled');
    };
    
    const verifyPasscode = (inputCode) => {
        return inputCode === passcode;
    };
    
    const updateAutoLock = (duration) => {
        if (duration) {
            localStorage.setItem('auto_lock_duration', duration);
        } else {
            localStorage.removeItem('auto_lock_duration');
        }
        setAutoLock(duration);
    };

    const unlock = async (method = 'biometric') => {
        if (method === 'passcode') {
            setIsLocked(false); // [FIX] Actually unlock the app
            return true;
        } 
        
        try {
            const success = await authenticateUser("Unlock Cipher");
            if (success) {
                setIsLocked(false);
                return true;
            }
        } catch (err) {
            console.error("Unlock failed", err);
        }
        return false;
    };

    const lockApp = () => {
        if (isEnabled || hasPasscode) {
            setIsLocked(true);
        }
    };

    // Helper: Trigger WebAuthn challenge
    const authenticateUser = async (reason) => {
        // We use a dummy challenge just to trigger the "User Verification" (PIN/Bio)
        // We are NOT registering a credential with a server here (Client-side Check Only)
        // Note: Some browsers strictly require a registered credential for get(), 
        // but 'create' with a dummy ID usually triggers the prompt on most platforms (Windows Hello/Android).
        // A robust implementation would register a real credential, but for a local lock, we can often rely on "User Presence".
        
        // Better approach for LOCAL lock without server:
        // Use `navigator.credentials.create` with `authenticatorSelection: { userVerification: 'required' }`
        // This forces the OS to verify the user.
        
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const userID = 'user_' + Date.now();
        const idBuffer = new TextEncoder().encode(userID);

        const publicKey = {
            challenge: challenge,
            rp: {
                name: "Cipher App Lock",
                id: window.location.hostname // Must match current domain
            },
            user: {
                id: idBuffer,
                name: "cipher_user",
                displayName: "Cipher User"
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            authenticatorSelection: {
                authenticatorAttachment: "platform", // Force TouchID/FaceID/Hello
                userVerification: "required" // Require PIN/Bio
            },
            timeout: 60000,
            attestation: "none"
        };

        try {
            // We use 'create' because 'get' usually requires a previously registered allowList.
            // Creating a NEW credential verifies user identity locally via the OS prompt.
            await navigator.credentials.create({ publicKey });
            return true;
        } catch (err) {
            // User cancelled or failed
            console.warn("WebAuthn prompt", err);
            return false;
        }
    };

    // Auto-lock on visibility change (backgrounding)
    useEffect(() => {
        let backgroundStart = 0;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // App went background
                if (isEnabled && !isLocked) {
                    backgroundStart = Date.now();
                }
            } else {
                // App came foreground
                if (isEnabled && !isLocked && backgroundStart > 0) {
                    const elapsed = Date.now() - backgroundStart;
                    // Lock if backgrounded for more than 1 minute (60000ms)
                    if (elapsed > 60000) {
                        setIsLocked(true);
                    }
                    backgroundStart = 0; // Reset
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isEnabled, isLocked]);

    return (
        <AppLockContext.Provider value={{ 
            isEnabled, 
            isLocked, 
            isSupported, 
            enableLock, 
            disableLock, 
            unlock, 
            lockApp,
            // Passcode Logic
            hasPasscode,
            setPasscode,
            removePasscode,
            autoLockDuration,
            setAutoLock: updateAutoLock,
            verifyPasscode
        }}>
            {children}
        </AppLockContext.Provider>
    );
};

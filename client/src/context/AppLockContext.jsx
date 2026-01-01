import { createContext, useContext, useState, useEffect, useRef } from 'react';

const AppLockContext = createContext();

export const useAppLock = () => useContext(AppLockContext);

export const AppLockProvider = ({ children }) => {
    // [FIX] Default to LOCKED if passcode exists to ensure security on refresh
    const [isLocked, setIsLocked] = useState(() => {
        return !!localStorage.getItem('app_passcode');
    });
    
    const [hasPasscode, setHasPasscode] = useState(() => {
        return !!localStorage.getItem('app_passcode');
    });

    const [autoLockDuration, setAutoLockDuration] = useState(null); // in minutes
    const timerRef = useRef(null);
    
    // Sync state effects
    useEffect(() => {
        // Restore auto-lock duration
        const storedDuration = localStorage.getItem('app_auto_lock_duration');
        if (storedDuration) {
            setAutoLockDuration(parseInt(storedDuration, 10));
        }
    }, []);

    // Encapsulate lockApp to be used in timer
    const lockApp = () => {
        setIsLocked(true);
        sessionStorage.setItem('app_is_locked', 'true');
    };

    // Auto-lock Timer Logic
    useEffect(() => {
        if (!hasPasscode || !autoLockDuration || isLocked) {
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        const resetTimer = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                lockApp();
            }, autoLockDuration * 60 * 1000); 
        };

        // Activity listeners
        const events = ['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll'];
        const handleActivity = () => resetTimer();
        
        events.forEach(event => window.addEventListener(event, handleActivity));
        resetTimer(); // Init

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => window.removeEventListener(event, handleActivity));
        };
    }, [hasPasscode, autoLockDuration, isLocked]);

    const hashPasscode = async (passcode) => {
        const msgBuffer = new TextEncoder().encode(passcode);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const setPasscode = async (passcode) => {
        const hash = await hashPasscode(passcode);
        localStorage.setItem('app_passcode', hash);
        setHasPasscode(true);
    };

    const setAutoLock = (minutes) => {
        if (minutes === null) {
            localStorage.removeItem('app_auto_lock_duration');
            setAutoLockDuration(null);
        } else {
            localStorage.setItem('app_auto_lock_duration', minutes);
            setAutoLockDuration(minutes);
        }
    };

    const removePasscode = () => {
        localStorage.removeItem('app_passcode');
        localStorage.removeItem('app_auto_lock_duration');
        sessionStorage.removeItem('app_is_locked');
        setHasPasscode(false);
        setIsLocked(false);
        setAutoLockDuration(null);
    };

    const [isUnlocking, setIsUnlocking] = useState(false); // [NEW] Transition state

    const unlockApp = async (inputPasscode) => {
        const storedHash = localStorage.getItem('app_passcode');
        if (!storedHash) return true; // No passcode set
        
        const inputHash = await hashPasscode(inputPasscode);
        
        if (inputHash === storedHash) {
            setIsLocked(false);
            sessionStorage.removeItem('app_is_locked');
            
            // [NEW] Trigger loading transition
            setIsUnlocking(true);
            setTimeout(() => {
                setIsUnlocking(false);
            }, 2500); // Show loading screen for 2.5s for smooth entry
            
            return true;
        }
        return false;
    };
    
    const verifyPasscode = async (inputPasscode) => {
        const storedHash = localStorage.getItem('app_passcode');
        if (!storedHash) return false;
        const inputHash = await hashPasscode(inputPasscode);
        return inputHash === storedHash;
    };

    return (
        <AppLockContext.Provider value={{ 
            isLocked, 
            isUnlocking, // [NEW]
            hasPasscode, 
            autoLockDuration,
            setPasscode, 
            setAutoLock,
            removePasscode, 
            lockApp, 
            unlockApp,
            verifyPasscode 
        }}>
            {children}
        </AppLockContext.Provider>
    );
};

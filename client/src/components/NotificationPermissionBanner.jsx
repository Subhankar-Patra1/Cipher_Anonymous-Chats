import { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';

export default function NotificationPermissionBanner() {
    const { 
        isSupported, 
        permission, 
        shouldShowPrompt, 
        requestPermission, 
        dismissPrompt 
    } = useNotification();
    
    const [isVisible, setIsVisible] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);

    // Delay showing the banner slightly for better UX
    useEffect(() => {
        if (shouldShowPrompt) {
            const timer = setTimeout(() => setIsVisible(true), 2000);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [shouldShowPrompt]);

    const handleEnable = async () => {
        setIsRequesting(true);
        const result = await requestPermission();
        setIsRequesting(false);
        
        if (result === 'granted') {
            setIsVisible(false);
        }
    };

    const handleDismiss = () => {
        setIsVisible(false);
        dismissPrompt();
    };

    if (!isSupported || !isVisible) return null;

    return (
        <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none animate-slide-in-up">
            <div className="relative pointer-events-auto flex items-center gap-4 px-5 py-3 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md">
                {/* Icon */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-xl">
                        notifications_active
                    </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        Enable notifications
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        Get alerts for new messages
                    </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleDismiss}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    >
                        Later
                    </button>
                    <button
                        onClick={handleEnable}
                        disabled={isRequesting}
                        className="px-4 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                        {isRequesting ? (
                            <>
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Enabling...</span>
                            </>
                        ) : (
                            'Enable'
                        )}
                    </button>
                </div>

                {/* Close button */}
                <button
                    onClick={handleDismiss}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-full flex items-center justify-center transition-colors"
                >
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-sm">
                        close
                    </span>
                </button>
            </div>
        </div>
    );
}

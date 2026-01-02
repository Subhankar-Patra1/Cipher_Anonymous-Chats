import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const NotificationContext = createContext();

export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}

export function NotificationProvider({ children }) {
    // Check if browser supports notifications
    const isSupported = typeof window !== 'undefined' && 'Notification' in window;
    
    const [permission, setPermission] = useState(() => {
        if (!isSupported) return 'unsupported';
        return Notification.permission;
    });
    
    // User preference (can be disabled even if permission granted)
    const [enabled, setEnabled] = useState(() => {
        const stored = localStorage.getItem('notifications_enabled');
        return stored !== null ? stored === 'true' : true; // Default enabled
    });
    
    // Track if user dismissed the permission prompt
    const [promptDismissed, setPromptDismissed] = useState(() => {
        return localStorage.getItem('notification_prompt_dismissed') === 'true';
    });

    // Update permission state when it changes
    useEffect(() => {
        if (!isSupported) return;
        
        // Some browsers fire a change event
        const checkPermission = () => {
            setPermission(Notification.permission);
        };
        
        // Check periodically (fallback for browsers without event)
        const interval = setInterval(checkPermission, 5000);
        return () => clearInterval(interval);
    }, [isSupported]);

    // Save user preference
    useEffect(() => {
        localStorage.setItem('notifications_enabled', enabled.toString());
    }, [enabled]);

    // Request permission from user
    const requestPermission = useCallback(async () => {
        if (!isSupported) return 'unsupported';
        
        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            return result;
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return 'denied';
        }
    }, [isSupported]);

    // Dismiss the permission prompt
    const dismissPrompt = useCallback(() => {
        setPromptDismissed(true);
        localStorage.setItem('notification_prompt_dismissed', 'true');
    }, []);
    
    // Reset prompt dismissed state (for settings)
    const resetPromptDismissed = useCallback(() => {
        setPromptDismissed(false);
        localStorage.removeItem('notification_prompt_dismissed');
    }, []);

    // Show a desktop notification
    const showNotification = useCallback(async (title, options = {}) => {
        // Check all conditions
        if (!isSupported) {
            console.log('[Notification] Browser does not support notifications');
            return null;
        }
        
        if (permission !== 'granted') {
            console.log('[Notification] Permission not granted:', permission);
            return null;
        }
        
        if (!enabled) {
            console.log('[Notification] Notifications disabled by user preference');
            return null;
        }

        try {
            const notificationOptions = {
                icon: options.icon || '/icon-192.png',
                badge: options.badge || '/icon-192.png',
                body: options.body || '',
                tag: options.tag || 'cipher-msg', // Group notifications
                silent: options.silent || false,
                requireInteraction: options.requireInteraction || false,
                vibrate: [200, 100, 200],
                data: options.data || {},
                ...options
            };

            // Use Service Worker if available for better background support
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                if (registration && registration.showNotification) {
                    return await registration.showNotification(title, notificationOptions);
                }
            }

            // Fallback to standard Notification API
            const notification = new Notification(title, notificationOptions);

            // Handle click
            notification.onclick = (event) => {
                event.preventDefault();
                window.focus();
                
                // Call custom onClick if provided
                if (options.onClick) {
                    options.onClick(notification.data);
                }
                
                notification.close();
            };

            // Auto-close after 5 seconds
            setTimeout(() => notification.close(), 5000);

            return notification;
        } catch (error) {
            console.error('[Notification] Error showing notification:', error);
            return null;
        }
    }, [isSupported, permission, enabled]);

    // Toggle notifications (user preference)
    const toggleEnabled = useCallback(() => {
        setEnabled(prev => !prev);
    }, []);

    const value = {
        // State
        isSupported,
        permission,
        enabled,
        promptDismissed,
        
        // Computed
        canNotify: isSupported && permission === 'granted' && enabled,
        shouldShowPrompt: isSupported && permission === 'default' && !promptDismissed,
        
        // Actions
        requestPermission,
        showNotification,
        toggleEnabled,
        setEnabled,
        dismissPrompt,
        resetPromptDismissed,
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ConfirmationModal from '../components/ConfirmationModal';

const ConfirmationContext = createContext();

export const useConfirm = () => {
    const context = useContext(ConfirmationContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmationProvider');
    }
    return context;
};

export const ConfirmationProvider = ({ children }) => {
    const [config, setConfig] = useState(null);
    const resolver = useRef();

    const confirm = useCallback((options) => {
        setConfig({
            title: options.title || 'Confirm Action',
            message: options.message || 'Are you sure you want to proceed?',
            confirmText: options.confirmText || 'Confirm',
            cancelText: options.cancelText || 'Cancel',
            type: options.type || 'primary' // 'primary' | 'danger' | 'warning'
        });

        return new Promise((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    const handleConfirm = () => {
        resolver.current(true);
        setConfig(null);
    };

    const handleCancel = () => {
        resolver.current(false);
        setConfig(null);
    };

    return (
        <ConfirmationContext.Provider value={confirm}>
            {children}
            {config && (
                <ConfirmationModal
                    isOpen={!!config}
                    title={config.title}
                    message={config.message}
                    confirmText={config.confirmText}
                    cancelText={config.cancelText}
                    type={config.type}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}
        </ConfirmationContext.Provider>
    );
};

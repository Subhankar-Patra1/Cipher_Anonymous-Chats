import React, { useEffect, useState } from 'react';

const ConfirmationModal = ({ 
    isOpen, 
    title, 
    message, 
    confirmText, 
    cancelText, 
    type = 'primary', 
    onConfirm, 
    onCancel 
}) => {
    const [shouldRender, setShouldRender] = useState(isOpen);

    useEffect(() => {
        if (isOpen) setShouldRender(true);
    }, [isOpen]);

    const handleAnimationEnd = () => {
        if (!isOpen) setShouldRender(false);
    };

    if (!shouldRender) return null;

    const isDanger = type === 'danger';

    return (
        <div 
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'bg-slate-950/60 backdrop-blur-sm' : 'bg-transparent pointer-events-none'}`}
            onAnimationEnd={handleAnimationEnd}
        >
            <div 
                className={`w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all duration-300 ${isOpen ? 'animate-modal-scale opacity-100' : 'scale-95 opacity-0'}`}
            >
                <div className="p-6">
                    {/* Icon & Title */}
                    <div className="flex items-center gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                            isDanger 
                            ? 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400' 
                            : 'bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400'
                        }`}>
                            <span className="material-symbols-outlined text-2xl">
                                {isDanger ? 'warning' : 'help'}
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white leading-tight">
                            {title}
                        </h3>
                    </div>

                    {/* Message */}
                    <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-8">
                        {message}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-white shadow-lg shadow-opacity-20 transition-all active:scale-[0.98] ${
                                isDanger 
                                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' 
                                : 'bg-violet-600 hover:bg-violet-700 shadow-violet-600/30'
                            }`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;

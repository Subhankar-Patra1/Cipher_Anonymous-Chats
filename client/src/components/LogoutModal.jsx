import { useEffect, useState } from 'react';

export default function LogoutModal({ isOpen, onClose, onConfirm }) {
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleLogout = async () => {
        setIsLoading(true);
        // Simulate network delay for better UX
        await new Promise(resolve => setTimeout(resolve, 1500));
        onConfirm();
        // isLoading will be reset when component unmounts or modal closes
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4 transition-colors duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-[400px] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in transition-colors duration-300">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">Logout</h3>
                    <button 
                        onClick={!isLoading ? onClose : undefined} 
                        className={`p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={isLoading}
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 flex flex-col items-center gap-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center mb-2">
                        <span className="material-symbols-outlined text-red-500 text-3xl">logout</span>
                    </div>
                    
                    <div className="space-y-2">
                        <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Are you sure you want to logout?</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            You will need to login again to access your chats.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 w-full mt-2">
                        <button 
                            onClick={onClose}
                            disabled={isLoading}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all duration-200 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleLogout}
                            disabled={isLoading}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/20 transition-all duration-200 flex items-center justify-center gap-2 ${isLoading ? 'opacity-80 cursor-wait' : ''}`}
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Logging out...</span>
                                </>
                            ) : (
                                "Yes, Logout"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

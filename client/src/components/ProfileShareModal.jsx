import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ProfileShareModal({ isOpen, user, onClose, triggerRect }) {
    const [copySuccess, setCopySuccess] = useState('');
    const inviteLink = `${window.location.origin}/invite?user=${user.username}`;

    const copyToClipboard = (text, type) => {
        navigator.clipboard.writeText(text);
        setCopySuccess(type);
        setTimeout(() => setCopySuccess(''), 2000);
    };

    // Calculate initial offsets for macOS-style expand animation
    const { initialX, initialY } = useMemo(() => {
        if (!triggerRect) return { initialX: 0, initialY: 0 };
        
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const triggerCenterX = triggerRect.left + triggerRect.width / 2;
        const triggerCenterY = triggerRect.top + triggerRect.height / 2;
        
        return {
            initialX: triggerCenterX - centerX,
            initialY: triggerCenterY - centerY
        };
    }, [triggerRect]);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 flex items-center justify-center z-[1000] p-4 overflow-hidden">
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div 
                        initial={{ 
                            scale: 0.01, 
                            opacity: 0, 
                            x: initialX, 
                            y: initialY 
                        }}
                        animate={{ 
                            scale: 1, 
                            opacity: 1, 
                            x: 0, 
                            y: 0 
                        }}
                        exit={{ 
                            scale: 0, 
                            opacity: 0, 
                            x: initialX, 
                            y: initialY 
                        }}
                        transition={{ 
                            duration: 0.4,
                            ease: [0.32, 0.72, 0, 1], // Apple-style snappy ease
                            opacity: { duration: 0.2 }
                        }}
                        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-[450px] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-colors overflow-hidden relative z-10"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center bg-white/50 dark:bg-slate-900/50 transition-colors">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">Share Profile</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{user.username}</p>
                            </div>
                            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-8 flex flex-col items-center gap-8">
                            {/* QR Code */}
                            <div className="bg-white p-4 rounded-2xl shadow-xl ring-4 ring-slate-100 dark:ring-slate-800 transition-all">
                                <QRCodeSVG value={inviteLink} size={180} level="M" />
                            </div>

                            {/* Link */}
                            <div className="w-full space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center block">Profile Link</label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50 truncate font-mono select-all text-center transition-colors">
                                        {inviteLink}
                                    </div>
                                    <button 
                                        onClick={() => copyToClipboard(inviteLink, 'link')}
                                        className={`w-10 h-10 flex items-center justify-center rounded-full border transition-all shrink-0 ${
                                            copySuccess === 'link'
                                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 dark:text-emerald-400' 
                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600'
                                        }`}
                                        title="Copy Link"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">{copySuccess === 'link' ? 'check' : 'content_copy'}</span>
                                    </button>
                                </div>
                            </div>

                            <p className="text-xs text-slate-500 text-center max-w-[80%]">
                                Scan or share to start a Direct Message with you instantly.
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

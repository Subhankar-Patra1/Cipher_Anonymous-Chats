import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cryptoManager } from '../lib/crypto/CryptoManager';
import db from '../utils/db';

const PROGRESS_STEPS = [
    { id: 'fetching', label: 'Retrieving secure backup...', detail: 'Connecting to encrypted vault...' },
    { id: 'decrypting', label: 'Decrypting message layers...', detail: 'Applying quantum-resistant ciphers...' },
    { id: 'importing', label: 'Reconstructing identity...', detail: 'Importing signing and exchange keys...' },
    { id: 'finalizing', label: 'Synchronizing history...', detail: 'Almost there! Preparing your chats.' },
    { id: 'completed', label: 'Restoration Complete!', detail: 'Your world is back in sync.' }
];

const FUN_FACTS = [
    "Did you know? Your messages are encrypted even from us.",
    "Breezing through the digital void...",
    "Reassembling your digital existence star by star.",
    "The keys are in the lock. Just a few more gears to turn.",
    "Security is not a product, but a process.",
    "Optimizing your encrypted experience...",
    "Fun fact: Cipher uses end-to-end encryption for everything."
];

export default function RestoreModal({ isOpen, onClose, onSkip, onRestoreSuccess, token, onSwitchToSync }) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [currentStep, setCurrentStep] = useState('idle');
    const [factIndex, setFactIndex] = useState(0);
    const [isClosing, setIsClosing] = useState(false);
    const [passwordHint, setPasswordHint] = useState('');
    const [attemptCount, setAttemptCount] = useState(0);
    const [isThrottled, setIsThrottled] = useState(false);
    const [progress, setProgress] = useState(0);
    const restoreCompletedRef = useRef(false);
    const factIntervalRef = useRef(null);

    // Fetch password hint when modal opens
    useEffect(() => {
        if (isOpen && token) {
            restoreCompletedRef.current = false;
            (async () => {
                try {
                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data?.password_hint) setPasswordHint(data.password_hint);
                    }
                } catch (err) {
                    console.warn('[Restore] Failed to fetch password hint:', err);
                }
            })();
        }
        if (!isOpen) {
            setPasswordHint('');
            setAttemptCount(0);
            setIsThrottled(false);
        }
    }, [isOpen, token]);

    useEffect(() => {
        if (loading) {
            factIntervalRef.current = setInterval(() => {
                setFactIndex(prev => (prev + 1) % FUN_FACTS.length);
            }, 3500);
        } else {
            clearInterval(factIntervalRef.current);
        }
        return () => clearInterval(factIntervalRef.current);
    }, [loading]);

    // Handle smooth closing
    const handleClose = () => {
        setIsClosing(true);
        // Only mark as skipped if restore hasn't completed successfully
        if (onSkip && !restoreCompletedRef.current) onSkip();
        setTimeout(() => {
            onClose();
            setIsClosing(false);
        }, 300);
    };

    // [REMOVED] Auto-close removed - parent controls closing via onRestoreSuccess callback
    // Modal stays open until parent explicitly sets isOpen to false

    if (!isOpen) return null;

    const handleRestore = async (e) => {
        if (e) e.preventDefault();
        setLoading(true);
        setError('');
        setCurrentStep('fetching');

        try {
            // Artificial delay for feel
            await new Promise(r => setTimeout(r, 800));

            // 1. Fetch encrypted backup from server
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch backup');
            const data = await res.json();
            if (!data) throw new Error('No backup found on server');

            setCurrentStep('decrypting');
            await new Promise(r => setTimeout(r, 1200));

            // 2. Decrypt bundle using password
            const rawBundle = await cryptoManager.decryptBackup(
                data.encrypted_blob,
                data.salt,
                data.iv,
                password
            );

            // 3. Parse and Import Bundle
            const bundle = JSON.parse(rawBundle);
            
            // Check if it's the new multi-table format or legacy keys-only format
            const hasHistory = bundle.version >= 2.0 && bundle.messages;

            setCurrentStep('importing');
            await new Promise(r => setTimeout(r, 1000));

            // Legacy support: if bundle is just the keys json string, bundle.keys will be undefined
            // If it's V2 (hasHistory), we pass the WHOLE bundle to importKeysSync, 
            // and let the robust parser inside handle extraction.
            const keyData = hasHistory ? JSON.stringify(bundle) : rawBundle;
            await cryptoManager.importKeysSync(keyData);

            if (hasHistory) {
                console.log(`[Restore] Importing history: ${bundle.messages.length} messages, ${bundle.rooms.length} rooms, ${bundle.users.length} users`);
                
                // Granular progress calculation
                const totalItems = (bundle.rooms?.length || 0) + (bundle.users?.length || 0) + (bundle.messages?.length || 0);
                let processedItems = 0;

                const updateProgress = (count) => {
                    processedItems += count;
                    const percent = Math.min(Math.round((processedItems / totalItems) * 100), 100);
                    setProgress(percent);
                };

                // Use bulkPut to safely merge data and overwrite existing if necessary
                if (bundle.rooms?.length > 0) {
                    await db.rooms.bulkPut(bundle.rooms);
                    updateProgress(bundle.rooms.length);
                }
                
                // Artificial delay for UI feel if fast
                await new Promise(r => setTimeout(r, 400));

                if (bundle.users?.length > 0) {
                    await db.users.bulkPut(bundle.users);
                    updateProgress(bundle.users.length);
                }

                await new Promise(r => setTimeout(r, 400));

                if (bundle.messages?.length > 0) {
                    // Import messages in chunks to show progress if large
                    const chunkSize = 100;
                    for (let i = 0; i < bundle.messages.length; i += chunkSize) {
                        const chunk = bundle.messages.slice(i, i + chunkSize);
                        await db.messages.bulkPut(chunk);
                        updateProgress(chunk.length);
                        // Brief yield to keep UI responsive
                        await new Promise(r => setTimeout(r, 10));
                    }
                }
            }

            // Enable auto-backup so future room keys are automatically backed up
            try {
                await cryptoManager.enableAutoBackup(password, data.salt, token);
            } catch (autoBackupErr) {
                console.warn('[Restore] Auto-backup enable failed (non-fatal):', autoBackupErr);
            }

            setCurrentStep('finalizing');
            setProgress(100);
            await new Promise(r => setTimeout(r, 1000));

            setCurrentStep('completed');
            restoreCompletedRef.current = true;
            setLoading(false);
            
            // Call parent's success handler which will wait for decryption and close us
            await onRestoreSuccess();
        } catch (err) {
            console.error('[Restore] Error:', err);
            const isPasswordError = err.name === 'OperationError';
            if (isPasswordError) {
                const newCount = attemptCount + 1;
                setAttemptCount(newCount);
                if (newCount >= 5) {
                    setIsThrottled(true);
                    setError('Too many failed attempts. Please wait 30 seconds.');
                    setTimeout(() => {
                        setIsThrottled(false);
                        setError('');
                    }, 30000);
                } else {
                    setError(`Invalid password. ${5 - newCount} attempts remaining.`);
                }
            } else {
                setError('Restoration failed. Please try again.');
            }
            setCurrentStep('idle');
            setLoading(false);
        }
    };

    const stepInfo = PROGRESS_STEPS.find(s => s.id === currentStep);
    
    // Dynamic progress calculation:
    // idle/fetching/decrypting/importing get fixed slices, 
    // but the 'importing' phase also uses the granular 'progress' state.
    const getOverallProgress = () => {
        if (currentStep === 'completed') return 100;
        if (currentStep === 'idle') return 0;
        
        const stepIdx = PROGRESS_STEPS.findIndex(s => s.id === currentStep);
        if (stepIdx === -1) return 0;
        
        // Let's divide 100% into roughly equal parts for the first 3 steps (0, 20, 40)
        // The 4th step 'importing' will map its granular 0-100% into the 40-80% range
        // The 5th step 'finalizing' will be 80-100%
        
        if (currentStep === 'fetching') return 15;
        if (currentStep === 'decrypting') return 35;
        if (currentStep === 'importing') return 40 + (progress * 0.45); // Maps 0-100 to 40-85
        if (currentStep === 'finalizing') return 85 + (progress === 100 ? 15 : 5);
        
        return (stepIdx + 1) / PROGRESS_STEPS.length * 100;
    };

    const progressPercent = getOverallProgress();

    return createPortal(
        <div className={`fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[3000] p-4 ${isClosing ? 'animate-out fade-out duration-300' : 'animate-in fade-in duration-300'}`}>
            <div className={`bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-3xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden transition-all duration-500 ${isClosing ? 'animate-out zoom-out-95 duration-300' : ''}`}>
                {/* Background Decor */}
                {loading && (
                    <div className="absolute top-0 left-0 w-full h-1 bg-gray-200 dark:bg-slate-800">
                        <div 
                            className="h-full bg-violet-500 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                )}

                <div className="text-center mb-6">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-500 ${loading ? 'bg-violet-600/20 scale-110' : 'bg-violet-600/10'}`}>
                        {currentStep === 'completed' ? (
                            <span className="material-symbols-outlined text-green-500 dark:text-green-400 text-3xl animate-check-pop">check_circle</span>
                        ) : loading ? (
                            <span className="material-symbols-outlined text-violet-500 dark:text-violet-400 text-3xl animate-spin">sync</span>
                        ) : (
                            <span className="material-symbols-outlined text-violet-500 dark:text-violet-400 text-3xl">cloud_download</span>
                        )}
                    </div>
                    
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        {currentStep === 'completed' ? 'Success!' : loading ? 'Restoration in Progress' : 'Restore History'}
                    </h2>
                    
                    {!loading && currentStep !== 'completed' ? (
                        <p className="text-gray-600 dark:text-slate-400 text-sm">
                            Enter your Backup Password to restore your chat history from the cloud.
                        </p>
                    ) : (
                        <div className="space-y-1">
                            <p className="text-violet-500 dark:text-violet-400 font-medium animate-pulse">{stepInfo?.label}</p>
                            <p className="text-gray-500 dark:text-slate-500 text-xs italic">{stepInfo?.detail}</p>
                        </div>
                    )}
                </div>

                {loading || currentStep === 'completed' ? (
                    <div className="py-6 flex flex-col items-center">
                        <div className="w-full bg-gray-100 dark:bg-slate-800/50 rounded-full h-1.5 mb-8 relative overflow-hidden">
                            <div 
                                className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600 animate-shimmer"
                                style={{ 
                                    width: `${progressPercent}%`,
                                    transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                            />
                        </div>

                        <div className="min-h-[60px] flex items-center justify-center text-center px-4">
                            <p className="text-gray-600 dark:text-slate-400 text-sm animate-fade-in" key={factIndex}>
                                {FUN_FACTS[factIndex]}
                            </p>
                        </div>
                        
                        {currentStep === 'completed' && (
                            <p className="mt-4 text-xs text-gray-500 dark:text-slate-500 animate-pulse">
                                Optimization complete. All systems nominal.
                            </p>
                        )}

                        {loading && currentStep === 'importing' && (
                             <div className="flex flex-col items-center gap-1 mt-2">
                                <span className="text-2xl font-black text-violet-600 dark:text-violet-400 tabular-nums">
                                    {progress}%
                                </span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Importing Data</span>
                             </div>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleRestore} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-slate-500 uppercase tracking-widest mb-3">Backup Password</label>
                            <div className="relative group">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl px-5 py-4 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 focus:bg-white dark:focus:bg-slate-800 transition-all shadow-inner"
                                    placeholder="Enter secure password"
                                    required
                                    autoFocus
                                />
                                <div className="absolute inset-0 rounded-2xl border border-violet-500/20 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
                            </div>
                        </div>

                        {passwordHint && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl text-sm flex items-start gap-2 animate-in fade-in">
                                <span className="material-symbols-outlined text-blue-500 dark:text-blue-400 text-lg mt-0.5">lightbulb</span>
                                <div>
                                    <p className="text-blue-600 dark:text-blue-300 font-bold text-xs uppercase mb-1">Password Hint</p>
                                    <p className="text-blue-800 dark:text-blue-100 italic">{passwordHint}</p>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 text-sm flex items-center gap-3 animate-in slide-in-from-top-2">
                                <span className="material-symbols-outlined text-lg">error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="flex flex-col gap-3 pt-3">
                            <button
                                type="submit"
                                disabled={!password || isThrottled}
                                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-sm tracking-wide hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-violet-500/25 active:scale-[0.98]"
                            >
                                Restore History
                            </button>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="flex-1 py-3.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-200 transition-all active:scale-[0.98]"
                                >
                                    Cancel
                                </button>
                                {/* [NEW] Sync Option */}
                                {onSwitchToSync && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsClosing(true);
                                            setTimeout(onSwitchToSync, 300);
                                        }}
                                        className="flex-1 py-3.5 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-violet-500/20 text-violet-600 dark:text-violet-400 font-semibold text-sm hover:bg-gray-100 dark:hover:bg-slate-800 hover:border-violet-500/40 hover:text-violet-700 dark:hover:text-violet-300 transition-all active:scale-[0.98]"
                                    >
                                        Sync from Device
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                )}

                <p className="mt-8 text-center text-[10px] text-gray-400 dark:text-slate-600 leading-relaxed max-w-[280px] mx-auto">
                    Note: Cipher uses zero-knowledge encryption. Your history can only be unlocked with your secure password.
                </p>
            </div>
        </div>,
        document.body
    );
}

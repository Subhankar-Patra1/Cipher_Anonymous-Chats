import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cryptoManager } from '../lib/crypto/CryptoManager';

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

export default function RestoreModal({ isOpen, onClose, onRestoreSuccess, token }) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [currentStep, setCurrentStep] = useState('idle');
    const [factIndex, setFactIndex] = useState(0);
    const factIntervalRef = useRef(null);

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
            const bundle = await cryptoManager.decryptBackup(
                data.encrypted_blob,
                data.salt,
                data.iv,
                password
            );

            setCurrentStep('importing');
            await new Promise(r => setTimeout(r, 1000));

            // 3. Import keys
            await cryptoManager.importKeysSync(bundle);

            // [NEW] Enable auto-backup so future room keys are automatically backed up
            await cryptoManager.enableAutoBackup(password, data.salt, token);

            setCurrentStep('finalizing');
            await new Promise(r => setTimeout(r, 1500));

            onRestoreSuccess();
            // Note: Dashboard will close us when animation is done
            setCurrentStep('completed');
        } catch (err) {
            console.error('[Restore] Error:', err);
            setError(err.name === 'OperationError' ? 'Invalid password. Decryption failed.' : 'Restoration failed. Please try again.');
            setCurrentStep('idle');
            setLoading(false);
        }
    };

    const stepInfo = PROGRESS_STEPS.find(s => s.id === currentStep);
    const progressPercent = (PROGRESS_STEPS.findIndex(s => s.id === currentStep) + 1) / PROGRESS_STEPS.length * 100;

    return createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[3000] p-4 animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden transition-all duration-500">
                {/* Background Decor */}
                {loading && (
                    <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                        <div 
                            className="h-full bg-violet-500 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                )}

                <div className="text-center mb-6">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-500 ${loading ? 'bg-violet-600/20 scale-110' : 'bg-violet-600/10'}`}>
                        {currentStep === 'completed' ? (
                            <span className="material-symbols-outlined text-green-400 text-3xl animate-check-pop">check_circle</span>
                        ) : loading ? (
                            <span className="material-symbols-outlined text-violet-400 text-3xl animate-spin">sync</span>
                        ) : (
                            <span className="material-symbols-outlined text-violet-400 text-3xl">cloud_download</span>
                        )}
                    </div>
                    
                    <h2 className="text-2xl font-bold text-white mb-2">
                        {currentStep === 'completed' ? 'Success!' : loading ? 'Restoration in Progress' : 'Restore History'}
                    </h2>
                    
                    {!loading && currentStep !== 'completed' ? (
                        <p className="text-slate-400 text-sm">
                            No active devices found. Enter your Backup Password to restore your encrypted chat history.
                        </p>
                    ) : (
                        <div className="space-y-1">
                            <p className="text-violet-400 font-medium animate-pulse">{stepInfo?.label}</p>
                            <p className="text-slate-500 text-xs italic">{stepInfo?.detail}</p>
                        </div>
                    )}
                </div>

                {loading || currentStep === 'completed' ? (
                    <div className="py-6 flex flex-col items-center">
                        <div className="w-full bg-slate-800/50 rounded-full h-1.5 mb-8 relative overflow-hidden">
                            <div 
                                className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600 animate-shimmer"
                                style={{ 
                                    width: `${progressPercent}%`,
                                    transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                            />
                        </div>

                        <div className="min-h-[60px] flex items-center justify-center text-center px-4">
                            <p className="text-slate-400 text-sm animate-fade-in" key={factIndex}>
                                {FUN_FACTS[factIndex]}
                            </p>
                        </div>
                        
                        {currentStep === 'completed' && (
                            <p className="mt-4 text-xs text-slate-500 animate-pulse">
                                Reassembling your chats... please wait.
                            </p>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleRestore} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Backup Password</label>
                            <div className="relative group">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 focus:bg-slate-800 transition-all shadow-inner"
                                    placeholder="Enter secure password"
                                    required
                                    autoFocus
                                />
                                <div className="absolute inset-0 rounded-2xl border border-violet-500/20 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-center gap-3 animate-in slide-in-from-top-2">
                                <span className="material-symbols-outlined text-lg">error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-4 rounded-2xl bg-slate-800 text-slate-400 font-bold hover:bg-slate-700 hover:text-slate-200 transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!password}
                                className="flex-[1.5] px-4 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed transition-all shadow-lg active:scale-95"
                            >
                                Restore History
                            </button>
                        </div>
                    </form>
                )}

                <p className="mt-8 text-center text-[10px] text-slate-600 leading-relaxed max-w-[280px] mx-auto">
                    Note: Cipher uses zero-knowledge encryption. Your history can only be unlocked with your secure password.
                </p>
            </div>
        </div>,
        document.body
    );
}

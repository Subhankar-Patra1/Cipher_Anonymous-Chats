import React, { useState, useEffect } from 'react';
import { cryptoManager } from '../lib/crypto/CryptoManager';

export default function CreateBackupModal({ isOpen, onClose, token, onBackupSuccess, hasActiveBackup }) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [passwordHint, setPasswordHint] = useState('');
    const [existingHint, setExistingHint] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setPassword('');
            setConfirmPassword('');
            setCurrentPassword('');
            setError('');
            setShowSuccess(false);
            setIsExiting(false);
            setShowPassword(false);
            setShowConfirmPassword(false);
            setCurrentPassword('');
            setError('');
            setShowSuccess(false);
            setIsExiting(false);
            setShowPassword(false);
            setShowConfirmPassword(false);
            setShowCurrentPassword(false);
            setPasswordHint('');
            setExistingHint('');
        }
    }, [isOpen]);

    useEffect(() => {
        const fetchHint = async () => {
            if (isOpen && hasActiveBackup) {
                try {
                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (data && data.password_hint) {
                        setExistingHint(data.password_hint);
                    }
                } catch (err) {
                    console.error('Failed to fetch hint:', err);
                }
            }
        };
        fetchHint();
    }, [isOpen, hasActiveBackup, token]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => {
            onClose();
        }, 300); // Wait for exit animation
    };

    if (!isOpen) return null;

    const handleCreateBackup = async (e) => {
        e.preventDefault();
        
        if (hasActiveBackup && !currentPassword) {
            setError('Please enter your current password');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (hasActiveBackup && password === currentPassword) {
            setError('New password must be different from current password');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // If updating, verify the current password first
            if (hasActiveBackup) {
                const checkRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const backupData = await checkRes.json();
                if (backupData) {
                    try {
                        await cryptoManager.decryptBackup(
                            backupData.encrypted_blob,
                            backupData.salt,
                            backupData.iv,
                            currentPassword
                        );
                    } catch (err) {
                        throw new Error('Incorrect current password');
                    }
                }
            }
            // 1. Export all keys as JWK
            const bundle = await cryptoManager.exportAllKeysSync();

            // 2. Encrypt bundle with password
            const backup = await cryptoManager.encryptBackup(bundle, password);

            // 3. Upload to server
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ ...backup, passwordHint: passwordHint.trim() || null })
            });

            if (!res.ok) throw new Error('Failed to upload backup');

            // [NEW] Enable auto-backup so future room keys are automatically backed up
            await cryptoManager.enableAutoBackup(password, backup.salt, token);

            if (onBackupSuccess) onBackupSuccess();
            setShowSuccess(true);
            setTimeout(() => {
                handleClose();
            }, 1500);
        } catch (err) {
            console.error('[Backup] Error:', err);
            setError(err.message || 'Failed to create backup. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`fixed inset-0 bg-white dark:bg-slate-900 flex items-start md:items-center justify-center z-[200] p-4 overflow-y-auto transition-opacity duration-300 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
            <div className={`p-6 w-full max-w-md relative my-auto transition-all duration-300 ${isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'} ${!isExiting && 'scale-in'}`}>
                {/* Back Button */}
                {!showSuccess && (
                    <button 
                        onClick={handleClose}
                        className="absolute top-4 left-4 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-transparent dark:hover:bg-slate-800 transition-all"
                        title="Back"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                )}

                {showSuccess ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-emerald-500 dark:text-emerald-400 text-5xl">check_circle</span>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Success!</h2>
                        <p className="text-slate-600 dark:text-slate-400">
                            {hasActiveBackup ? 'Backup password updated successfully.' : 'Cloud backup created successfully.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-6 pt-4">
                            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-3xl">{hasActiveBackup ? 'refresh' : 'cloud_upload'}</span>
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{hasActiveBackup ? 'Update Backup' : 'Cloud Backup'}</h2>
                            <p className="text-slate-600 dark:text-slate-400 text-sm">
                                {hasActiveBackup 
                                    ? 'Update your backup password and re-secure your encryption keys.' 
                                    : 'Create a password-protected backup of your encryption keys to restore your history on new devices.'}
                            </p>
                        </div>

                        <form onSubmit={handleCreateBackup} className="space-y-4">
                            {hasActiveBackup && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current Password</label>
                                    <div className="relative">
                                        <input
                                            type={showCurrentPassword ? "text" : "password"}
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                            placeholder="Enter current password"
                                            required
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[22px] leading-none">
                                                {showCurrentPassword ? 'visibility' : 'visibility_off'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {existingHint && isOpen && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg text-sm flex items-start gap-2">
                                    <span className="material-symbols-outlined text-blue-500 dark:text-blue-400 text-lg mt-0.5">lightbulb</span>
                                    <div>
                                        <p className="text-blue-600 dark:text-blue-300 font-bold text-xs uppercase mb-1">Passowrd Hint</p>
                                        <p className="text-blue-800 dark:text-blue-100 italic">{existingHint}</p>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    {hasActiveBackup ? 'New Password' : 'Create Password'}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm dark:shadow-inner placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                        placeholder="Strong password"
                                        required
                                        minLength={8}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[22px] leading-none">
                                            {showPassword ? 'visibility' : 'visibility_off'}
                                        </span>
                                    </button>
                                </div>
                                {/* Password Criteria */}
                                <div className="mt-2 space-y-1">
                                    <p className={`text-[10px] flex items-center gap-1.5 font-medium transition-colors ${password.length >= 8 ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500'}`}>
                                        <span className="material-symbols-outlined text-[14px]">
                                            {password.length >= 8 ? 'check_circle' : 'circle'}
                                        </span>
                                        Minimum 8 characters
                                    </p>
                                    <p className={`text-[10px] flex items-center gap-1.5 font-medium transition-colors ${/[0-9]/.test(password) ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500'}`}>
                                        <span className="material-symbols-outlined text-[14px]">
                                            {/[0-9]/.test(password) ? 'check_circle' : 'circle'}
                                        </span>
                                        At least one number
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Confirm Password</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                        placeholder="Repeat password"
                                        required
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[22px] leading-none">
                                            {showConfirmPassword ? 'visibility' : 'visibility_off'}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password Hint (Optional)</label>
                                <input
                                    type="text"
                                    value={passwordHint}
                                    onChange={(e) => setPasswordHint(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                    placeholder="Something to help you remember"
                                    maxLength={100}
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm flex items-center gap-2 animate-shake">
                                    <span className="material-symbols-outlined text-sm">error</span>
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold transition-all text-sm"
                                    
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || password.length < 8 || !/[0-9]/.test(password) || password !== confirmPassword || (hasActiveBackup && !currentPassword)}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-500/20"
                                >
                                    {loading ? (
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                    ) : (hasActiveBackup ? 'Update Backup' : 'Set Backup')}
                                </button>
                            </div>
                        </form>

                        <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700/50">
                            <div className="flex gap-3">
                                <span className="material-symbols-outlined text-amber-500 text-xl shrink-0">warning</span>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed uppercase font-bold tracking-tight">
                                    CIPHER CANNOT RESET THIS PASSWORD. IF YOU LOSE IT, YOUR BACKUP IS PERMANENTLY UNRECOVERABLE.
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

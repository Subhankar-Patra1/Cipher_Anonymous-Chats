import React, { useState } from 'react';
import { cryptoManager } from '../lib/crypto/CryptoManager';

export default function RestoreModal({ isOpen, onClose, onRestoreSuccess, token }) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleRestore = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 1. Fetch encrypted backup from server
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch backup');
            const data = await res.json();
            if (!data) throw new Error('No backup found on server');

            // 2. Decrypt bundle using password
            const bundle = await cryptoManager.decryptBackup(
                data.encrypted_blob,
                data.salt,
                data.iv,
                password
            );

            // 3. Import keys
            await cryptoManager.importKeysSync(bundle);

            onRestoreSuccess();
            onClose();
        } catch (err) {
            console.error('[Restore] Error:', err);
            setError(err.name === 'OperationError' ? 'Invalid password. Decryption failed.' : 'Restoration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[200] p-4 scale-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-violet-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-violet-400 text-3xl">cloud_download</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Restore History</h2>
                    <p className="text-slate-400 text-sm">
                        No active devices found. Enter your Backup Password to restore your encrypted chat history.
                    </p>
                </div>

                <form onSubmit={handleRestore} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Backup Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                            placeholder="Enter your password"
                            required
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">error</span>
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !password}
                            className="flex-1 px-4 py-3 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            ) : 'Restore'}
                        </button>
                    </div>
                </form>

                <p className="mt-6 text-center text-[10px] text-slate-500 leading-relaxed italic">
                    Note: Your history is end-to-end encrypted. Without the correct password, your messages remain locked forever. 🛡️
                </p>
            </div>
        </div>
    );
}

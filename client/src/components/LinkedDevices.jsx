import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import SkeletonLoaders from './SkeletonLoaders';

const DeviceIcon = ({ type, os }) => {
    // Determine icon based on type/os
    let icon = 'devices'; // default
    
    if (type === 'mobile') icon = 'smartphone';
    if (type === 'tablet') icon = 'tablet_mac';
    if (type === 'desktop') icon = 'computer';
    
    return (
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <span className="material-symbols-outlined">{icon}</span>
        </div>
    );
};

// Helper for formatting "Active X minutes ago" or similar
const formatTime = (isoString) => {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    const now = new Date();
    
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Active now';
    
    // If today
    if (date.toDateString() === now.toDateString()) {
        return `Last active today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // If yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return `Last active yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return `Last active ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const EditableName = ({ initialName, sessionId, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(initialName);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === initialName) {
            setIsEditing(false);
            setName(initialName);
            return;
        }

        setLoading(true);
        const success = await onSave(sessionId, trimmed);
        setLoading(false);
        if (success) setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-2 min-w-0" onClick={e => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="flex-1 min-w-0 bg-white dark:bg-slate-800 border-b-2 border-violet-500 text-sm font-bold text-slate-800 dark:text-white outline-none px-0 py-0.5"
                    disabled={loading}
                    onKeyDown={e => {
                        if (e.key === 'Enter') handleSave();
                        if (e.key === 'Escape') {
                            setIsEditing(false);
                            setName(initialName);
                        }
                    }}
                    maxLength={50}
                />
                <button 
                    onClick={handleSave}
                    disabled={loading}
                    className="w-6 h-6 flex items-center justify-center bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                >
                    {loading ? <span className="w-3 h-3 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" /> : <span className="material-symbols-outlined text-[16px]">check</span>}
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 min-w-0 group/edit">
            <h4 className="font-bold text-slate-800 dark:text-white truncate" title={initialName}>
                {name}
            </h4>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                }}
                className="opacity-0 group-hover/edit:opacity-100 text-slate-400 hover:text-violet-500 transition-opacity p-0.5"
            >
                <span className="material-symbols-outlined text-[14px]">edit</span>
            </button>
        </div>
    );
};

export default function LinkedDevices({ onClose }) {
    const { token } = useAuth();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null); // id or 'all'

    useEffect(() => {
        const fetchSessions = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setSessions(data);
                }
            } catch (err) {
                console.error('Failed to fetch sessions', err);
            } finally {
                setLoading(false);
            }
        };
        fetchSessions();
    }, [token]);

    const handleRevoke = async (sessionId) => {
        setActionLoading(sessionId);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/${sessionId}/revoke`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setSessions(prev => prev.filter(s => s.id !== sessionId));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRevokeOthers = async () => {
        setActionLoading('all');
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/revoke-others`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setSessions(prev => prev.filter(s => s.isCurrent));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRename = async (sessionId, newName) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/${sessionId}/name`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ name: newName })
            });
            if (res.ok) {
                setSessions(prev => prev.map(s => {
                    if (s.id === sessionId) return { ...s, device_name: newName };
                    return s;
                }));
                return true;
            }
        } catch (err) {
            console.error('Failed to rename session', err);
        }
        return false;
    };

    const currentSession = sessions.find(s => s.isCurrent);
    const otherSessions = sessions.filter(s => !s.isCurrent);

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div 
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col animate-scale-up relative transition-colors"
                onClick={e => e.stopPropagation()}
                style={{ maxHeight: '80vh' }}
            >
                {/* Header */}
                <div className="p-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <button 
                        onClick={onClose} 
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Linked Devices</h2>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                         <div className="space-y-4">
                            <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                            <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                            <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Current Device */}
                            {currentSession ? (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Current Device</h3>
                                    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                                        <div className="mt-1">
                                            <DeviceIcon type={currentSession.device_type} os={currentSession.os} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <EditableName 
                                                initialName={currentSession.device_name} 
                                                sessionId={currentSession.id} 
                                                onSave={handleRename} 
                                            />
                                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
                                                <p className="truncate">
                                                    {formatTime(currentSession.last_active_at)}
                                                    {currentSession.location ? ` • ${currentSession.location}` : ''}
                                                </p>
                                                <p className="text-slate-400 dark:text-slate-500">
                                                    Linked on {formatDate(currentSession.created_at)}
                                                </p>
                                            </div>
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold mt-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                Active now
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Current Device</h3>
                                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-500 shrink-0">
                                            <span className="material-symbols-outlined">warning</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-slate-800 dark:text-white">Unregistered Session</h4>
                                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                                This device is using an old session. Please log out and log in again to register it.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Other Devices */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Other Devices</h3>
                                {otherSessions.length === 0 ? (
                                    <div className="text-center py-6 text-slate-400 dark:text-slate-500 italic text-sm bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                        No other devices linked
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {otherSessions.map(session => (
                                            <div key={session.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 rounded-xl p-3 flex items-start gap-3 transition-colors group">
                                                <div className="mt-1">
                                                    <DeviceIcon type={session.device_type} os={session.os} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <EditableName 
                                                                initialName={session.device_name} 
                                                                sessionId={session.id} 
                                                                onSave={handleRename} 
                                                            />
                                                        </div>
                                                        <button 
                                                            onClick={() => handleRevoke(session.id)}
                                                            disabled={actionLoading === session.id}
                                                            className="px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors disabled:opacity-50 shrink-0 ml-1"
                                                        >
                                                            {actionLoading === session.id ? '...' : 'Log Out'}
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                                                        <p className="truncate">
                                                            {formatTime(session.last_active_at)}
                                                            {session.location ? ` • ${session.location}` : ''}
                                                        </p>
                                                        <p className="text-slate-300 dark:text-slate-600">
                                                            Linked on {formatDate(session.created_at)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                {otherSessions.length > 0 && (
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
                        <button 
                            onClick={handleRevokeOthers}
                            disabled={actionLoading === 'all'}
                            className="w-full flex items-center justify-center gap-2 p-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 shadow-lg shadow-red-500/20"
                        >
                            {actionLoading === 'all' && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            Log out from all other devices
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

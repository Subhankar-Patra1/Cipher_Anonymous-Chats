import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

import { renderTextWithEmojis } from '../utils/emojiRenderer';

const GroupAddParticipantsView = ({
    room,
    onAddMember,
    onBack
}) => {
    const { token } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [addingUserId, setAddingUserId] = useState(null);
    const [error, setError] = useState('');
    const [invitedIds, setInvitedIds] = useState(new Set());

    useEffect(() => {
        const timer = setTimeout(async () => {
            const q = searchTerm.trim();
            if (q.length < 2) {
                setSearchResults([]);
                return;
            }
            
            setLoading(true);
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/search?q=${encodeURIComponent(q)}&excludeGroupId=${room.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                    });
                const data = await res.json();
                setSearchResults(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, room.id, token]);

    const handleAdd = async (userId) => {
        setAddingUserId(userId);
        setError('');
        try {
            const result = await onAddMember(userId, true);
            if (result?.invited) {
                // Privacy blocked - invitation was sent via DM instead
                setError('');
                setSearchResults(prev => prev.filter(u => u.id !== userId));
                setInvitedIds(prev => new Set([...prev, userId]));
            } else {
                // Direct add succeeded
                setSearchTerm('');
                setSearchResults([]);
                onBack();
            }
        } catch (err) {
            setError(err.message || 'Failed to add member');
        } finally {
            setAddingUserId(null);
        }
    };

    return (

        <div className="flex flex-col h-full bg-white dark:bg-slate-900 transition-colors duration-300">
             {/* Header */}
             <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 transition-colors">
                <button 
                    onClick={onBack}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div className="flex-1">
                    <h3 className="text-slate-800 dark:text-white font-bold text-lg transition-colors">Add Participants</h3>
                </div>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50 transition-colors">
                 <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:border-violet-500 transition-colors flex items-center gap-2">
                    <span className="text-slate-400 dark:text-slate-500 material-symbols-outlined transition-colors">search</span>
                    <input 
                        type="text" 
                        placeholder="Search by username..." 
                        className="bg-transparent flex-1 text-sm text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                    {loading && (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-500 border-t-transparent"></div>
                    )}
                    {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm('')}
                            className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    )}
                </div>
                {error && <p className="text-xs text-red-500 mt-2 ml-1">{error}</p>}
            </div>

            {/* Results */}
            <div className="overflow-y-auto custom-scrollbar flex-1 p-2">
                {searchResults.length === 0 && searchTerm.length >= 2 && !loading && (
                    <div className="text-center p-8 text-slate-500 dark:text-slate-500 transition-colors">
                        No users found
                    </div>
                )}

                {searchResults.map(user => (
                    <div
                        key={user.id}
                        className={`group w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer rounded-xl ${invitedIds.has(user.id) ? 'opacity-60' : ''}`}
                        onClick={() => !addingUserId && !invitedIds.has(user.id) && handleAdd(user.id)}
                    >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 transition-colors">
                            {user.avatar_thumb_url ? (
                                <img src={user.avatar_thumb_url} alt={user.username} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-slate-500 dark:text-slate-400 font-bold text-sm transition-colors">{user.display_name?.[0]?.toUpperCase()}</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate transition-colors">{renderTextWithEmojis(user.display_name)}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-500 truncate transition-colors">{user.username.startsWith('@') ? user.username : '@' + user.username}</div>
                        </div>
                        {invitedIds.has(user.id) ? (
                            <span className="text-xs font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">Invited ✓</span>
                        ) : addingUserId === user.id ? (
                             <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-500 border-t-transparent"></div>
                        ) : (
                            <button className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-600/10 text-violet-600 dark:text-violet-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-violet-600 hover:text-white dark:hover:bg-violet-600 dark:hover:text-white">
                                <span className="material-symbols-outlined text-xl">add</span>
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GroupAddParticipantsView;

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function CreateRoomModal({ onClose, onCreate }) {
    const { token } = useAuth();
    const [name, setName] = useState('');
    const [type, setType] = useState('group');
    
    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (type !== 'direct' || !searchQuery) {
            setSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/search?q=${searchQuery}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setSearchResults(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, type, token]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (type === 'direct') {
            if (!selectedUser) return;
            onCreate({ type, targetUserId: selectedUser.id });
        } else {
            onCreate({ name, type });
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 transition-colors duration-300">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 shadow-2xl animate-modal-scale transition-colors">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">Create New Room</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1.5">Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => { setType('group'); setSelectedUser(null); }}
                                className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                                    type === 'group' 
                                    ? 'bg-violet-600/10 border-violet-500/50 text-violet-600 dark:text-violet-300' 
                                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="material-symbols-outlined block text-2xl mb-1">group</span>
                                Group
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('direct')}
                                className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                                    type === 'direct' 
                                    ? 'bg-violet-600/10 border-violet-500/50 text-violet-600 dark:text-violet-300' 
                                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="material-symbols-outlined block text-2xl mb-1">person</span>
                                Direct
                            </button>
                        </div>
                    </div>

                    {type === 'group' ? (
                        <div>
                            <label className="block text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1.5">Room Name</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-violet-500/50 border border-slate-200 dark:border-slate-700 focus:border-violet-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Project Alpha"
                                required
                            />
                            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">info</span>
                                Group rooms expire automatically after 48 hours.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1.5">Search User</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl p-3 pl-10 focus:outline-none focus:ring-2 focus:ring-violet-500/50 border border-slate-200 dark:border-slate-700 focus:border-violet-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                    value={selectedUser ? selectedUser.username : searchQuery}
                                    onChange={e => {
                                        setSearchQuery(e.target.value);
                                        setSelectedUser(null);
                                    }}
                                    placeholder="Search by username..."
                                    required={!selectedUser}
                                />
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">search</span>
                                {isSearching && (
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 animate-spin">progress_activity</span>
                                )}
                            </div>

                            {/* Search Results */}
                            {!selectedUser && searchQuery && searchResults.length > 0 && (
                                <div className="mt-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden max-h-48 shadow-lg z-10 relative">
                                    <div className="overflow-y-auto max-h-48 custom-scrollbar p-1">
                                        {searchResults.map(user => (
                                            <button
                                                key={user.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setSearchQuery('');
                                                    setSearchResults([]);
                                                }}
                                                className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg flex items-center gap-3 transition-colors"
                                            >
                                                {user.avatar_thumb_url ? (
                                                    <img 
                                                        src={user.avatar_thumb_url} 
                                                        alt={user.display_name} 
                                                        className="w-8 h-8 rounded-full object-cover shrink-0 bg-slate-200 dark:bg-slate-700" 
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                        {user.display_name[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{user.display_name}</p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                        {user.username.startsWith('@') ? user.username : `@${user.username}`}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedUser && (
                                <div className="mt-2 p-3 bg-violet-50 dark:bg-violet-600/10 border border-violet-200 dark:border-violet-500/20 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {selectedUser.avatar_thumb_url ? (
                                            <img 
                                                src={selectedUser.avatar_thumb_url} 
                                                alt={selectedUser.display_name} 
                                                className="w-8 h-8 rounded-full object-cover shrink-0 bg-slate-200 dark:bg-slate-700" 
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                                {selectedUser.display_name[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm font-medium text-slate-800 dark:text-white">{selectedUser.display_name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {selectedUser.username.startsWith('@') ? selectedUser.username : `@${selectedUser.username}`}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => setSelectedUser(null)}
                                        className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                    >
                                        <span className="material-symbols-outlined text-lg">close</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3 mt-8">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={type === 'direct' && !selectedUser}
                            className={`flex-1 px-4 py-2.5 rounded-xl font-bold shadow-lg transition-all ${
                                type === 'direct' && !selectedUser
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none'
                                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20'
                            }`}
                        >
                            {type === 'direct' ? 'Start Chat' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

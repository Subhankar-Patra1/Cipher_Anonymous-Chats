import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import { AnimatePresence, motion } from 'framer-motion';

export default function CreateRoomModal({ onClose, onCreate }) {
    const { token } = useAuth();
    const [name, setName] = useState('');
    const [type, setType] = useState('group');
    
    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [loading, setLoading] = useState(false);

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        if (type === 'direct') {
            if (!selectedUser) {
                setLoading(false);
                return;
            }
            await onCreate({ type, targetUserId: selectedUser.id });
        } else {
            await onCreate({ name, type });
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-300 p-4">
            <div className="bg-white dark:bg-[#1e1e24] p-6 rounded-2xl w-full max-w-[420px] shadow-2xl shadow-black/40 border border-slate-100 dark:border-slate-800 animate-modal-scale relative">
                
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Create Room</h3>
                    <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-all">
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    
                    {/* Pill Tabs (Toggle) */}
                    <div className="bg-slate-100 dark:bg-slate-800/50 rounded-full p-1.5 grid grid-cols-2 relative ring-1 ring-slate-900/5 dark:ring-white/5">
                        {/* Animated Background Pill */}
                        <div 
                            className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-white dark:bg-slate-700 rounded-full shadow-sm transition-all duration-300 ease-out ${
                                type === 'group' ? 'left-1.5' : 'left-[calc(50%+1.5px)]'
                            }`}
                        />
                        
                        <button
                            type="button"
                            onClick={() => { setType('group'); setSelectedUser(null); }}
                            className={`relative z-10 py-2.5 rounded-full text-sm font-bold transition-colors duration-300 flex items-center justify-center gap-2 ${
                                type === 'group' 
                                ? 'text-slate-900 dark:text-white' 
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">group</span>
                            Group
                        </button>
                        <button
                            type="button"
                            onClick={() => setType('direct')}
                            className={`relative z-10 py-2.5 rounded-full text-sm font-bold transition-colors duration-300 flex items-center justify-center gap-2 ${
                                type === 'direct' 
                                ? 'text-slate-900 dark:text-white' 
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">person</span>
                            Direct
                        </button>
                    </div>

                    <div className="min-h-[140px]">
                    {type === 'group' ? (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-5">
                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider mb-2.5 ml-1">
                                    Room Name
                                </label>
                                <div className="relative group/input">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within/input:text-violet-500 transition-colors pointer-events-none">tag</span>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-black/20 dark:hover:bg-black/30 text-slate-900 dark:text-white rounded-xl py-3.5 pl-12 pr-4 focus:outline-none ring-1 ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-violet-500 border-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="e.g. Project Alpha"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="p-3.5 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex gap-3 border border-violet-100 dark:border-violet-500/20">
                                <span className="material-symbols-outlined text-violet-500 dark:text-violet-400 mt-0.5">timer</span>
                                <div>
                                    <p className="text-sm font-bold text-slate-800 dark:text-white">Auto-Expiries</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Group chats automatically delete after 48 hours of inactivity to keep things clean.</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pt-2">
                            <label className="block text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider mb-2.5 ml-1">
                                Search User
                            </label>
                            <div className="relative group/search mb-2">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within/search:text-violet-500 transition-colors pointer-events-none">search</span>
                                
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-black/20 dark:hover:bg-black/30 text-slate-900 dark:text-white rounded-xl py-3.5 pl-12 pr-10 focus:outline-none ring-1 ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-violet-500 border-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium"
                                    value={selectedUser ? selectedUser.username : searchQuery}
                                    onChange={e => {
                                        setSearchQuery(e.target.value);
                                        setSelectedUser(null);
                                    }}
                                    placeholder="Search by username..."
                                    required={!selectedUser}
                                    autoFocus
                                />
                                
                                {isSearching && (
                                    <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 text-violet-500 animate-spin text-[18px] pointer-events-none">progress_activity</span>
                                )}
                            </div>

                            {/* Search Results Dropdown */}
                            {/* Search Results Dropdown */}
                            <AnimatePresence>
                                {!selectedUser && searchQuery && searchResults.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10, height: 0, marginTop: 0 }}
                                        animate={{ opacity: 1, y: 0, height: 'auto', marginTop: 8 }}
                                        exit={{ opacity: 0, y: -10, height: 0, marginTop: 0 }}
                                        transition={{ duration: 0.3, ease: "easeInOut" }}
                                        className="w-full bg-white dark:bg-zinc-900 rounded-lg border border-slate-100 dark:border-zinc-700 shadow-sm z-10 overflow-hidden ring-1 ring-black/5"
                                    >
                                        <div className="max-h-56 overflow-y-auto custom-scrollbar p-1.5">
                                            {searchResults.map(user => (
                                                <button
                                                    key={user.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedUser(user);
                                                        setSearchQuery('');
                                                        setSearchResults([]);
                                                    }}
                                                    className="w-full text-left p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-3 transition-colors group/item"
                                                >
                                                    {user.avatar_thumb_url ? (
                                                        <img 
                                                            src={user.avatar_thumb_url} 
                                                            alt={user.display_name} 
                                                            className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-slate-800 shadow-sm" 
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0 ring-2 ring-white dark:ring-slate-800 shadow-sm shadow-violet-500/20">
                                                            {user.display_name[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{renderTextWithEmojis(user.display_name)}</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-medium">
                                                            {user.username.startsWith('@') ? user.username : `@${user.username}`}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {selectedUser && (
                                <div className="mt-4 p-2 pr-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center gap-3">
                                        {selectedUser.avatar_thumb_url ? (
                                            <img 
                                                src={selectedUser.avatar_thumb_url} 
                                                alt={selectedUser.display_name} 
                                                className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-violet-200 dark:ring-violet-900" 
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-violet-200 dark:ring-violet-900 shadow-sm shadow-violet-500/20">
                                                {selectedUser.display_name[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">{renderTextWithEmojis(selectedUser.display_name)}</p>
                                            <p className="text-xs text-violet-600 dark:text-violet-400 font-bold">
                                                Selected for chat
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => setSelectedUser(null)}
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shadow-sm"
                                    >
                                        <span className="material-symbols-outlined text-lg">close</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="px-5 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-xl font-bold transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={(type === 'direct' && !selectedUser) || (type === 'group' && !name.trim()) || loading}
                            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-[0.98] ${
                                (type === 'direct' && !selectedUser) || (type === 'group' && !name.trim())
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none'
                                : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900'
                            }`}
                        >
                            {loading ? (
                                <span className="w-4 h-4 border-2 border-white/30 dark:border-slate-900/30 border-t-white dark:border-t-slate-900 rounded-full animate-spin"/>
                            ) : (
                                <>
                                    <span>Create</span>
                                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

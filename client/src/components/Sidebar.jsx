import { useState, useEffect, useRef } from 'react';
import { usePresence } from '../context/PresenceContext';
import { useTheme } from '../context/ThemeContext';
import StatusDot from './StatusDot';
import ProfileShareModal from './ProfileShareModal';
import ProfilePanel from './ProfilePanel';
import { linkifyText } from '../utils/linkify';


export default function Sidebar({ rooms, activeRoom, onSelectRoom, loadingRoomId, onCreateRoom, onJoinRoom, user, onLogout }) {
    const { presenceMap, fetchStatuses } = usePresence();
    const { theme, toggleTheme } = useTheme();
    const [tab, setTab] = useState('group'); // 'group' or 'direct'
    const [showShareProfile, setShowShareProfile] = useState(false);
    const [showMyProfile, setShowMyProfile] = useState(false);
    const myProfileRef = useRef(null);


    const filteredRooms = rooms.filter(r => r.type === tab);
    
    // Fetch status for direct chat users
    useEffect(() => {
        const userIds = rooms
            .filter(r => r.type === 'direct' && r.other_user_id)
            .map(r => r.other_user_id);
            
        if (userIds.length > 0) {
            fetchStatuses(userIds);
        }
    }, [rooms]);

    return (
        <div className="w-full h-full bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl transition-colors">
            {/* Header */}
            <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center bg-white/30 dark:bg-slate-900/30">
                <div className="flex items-center gap-3">
                    <div 
                        className="flex items-center gap-3 cursor-pointer"
                        ref={myProfileRef}
                        onClick={() => setShowMyProfile(!showMyProfile)}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-500/20 overflow-hidden ${!user.avatar_thumb_url ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}>
                            {user.avatar_thumb_url ? (
                                <img src={user.avatar_thumb_url} alt="Me" className="w-full h-full object-cover" />
                            ) : (
                                user.display_name[0].toUpperCase()
                            )}
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[100px] transition-colors">{user.display_name}</h2>
                            <div className="flex items-center gap-1">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium transition-colors">
                                    {user.username.startsWith('@') ? user.username : `@${user.username}`}
                                </p>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowShareProfile(true);
                        }}
                        className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white transition-colors"
                        title="Share Profile"
                    >
                        <span className="material-symbols-outlined text-[14px]">qr_code_2</span>
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={(e) => toggleTheme(e)} 
                        className="p-2 rounded-full text-slate-400 dark:text-slate-400 hover:text-amber-500 dark:hover:text-yellow-400 transition-all duration-200"
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        <span className="material-symbols-outlined text-xl transition-transform duration-500 rotate-0 dark:rotate-180">
                            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    <button 
                        onClick={onLogout} 
                        className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-all duration-200"
                        title="Logout"
                    >
                        <span className="material-symbols-outlined text-xl">logout</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="p-4 pb-2">
                <div className="flex p-1 bg-slate-100 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800/50 transition-colors">
                    <button 
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${tab === 'group' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        onClick={() => setTab('group')}
                    >
                        Groups
                    </button>
                    <button 
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative ${tab === 'direct' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        onClick={() => setTab('direct')}
                    >
                        Direct
                        {rooms.filter(r => r.type === 'direct').reduce((acc, r) => acc + (r.unread_count || 0), 0) > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-white dark:border-slate-900">
                                {rooms.filter(r => r.type === 'direct').reduce((acc, r) => acc + (r.unread_count || 0), 0) > 99 ? '99+' : rooms.filter(r => r.type === 'direct').reduce((acc, r) => acc + (r.unread_count || 0), 0)}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Room List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                {filteredRooms.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        No {tab} chats yet.
                    </div>
                )}
                {filteredRooms.map(room => (
                    <button
                        key={room.id}
                        onClick={() => onSelectRoom(room)}
                        disabled={loadingRoomId === room.id} 
                        className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all duration-200 group hover:translate-x-1 ${
                            activeRoom?.id === room.id 
                            ? 'bg-violet-100 dark:bg-violet-600/10 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/20 shadow-sm' 
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                        }`}
                    >
                        <div className={`w-10 h-10 flex items-center justify-center ${room.type === 'direct' ? 'rounded-full' : 'rounded-lg p-2'} ${activeRoom?.id === room.id ? 'bg-violet-200 dark:bg-violet-500/20' : 'bg-slate-200 dark:bg-slate-800 group-hover:bg-slate-300 dark:group-hover:bg-slate-700'} transition-colors relative`}>
                            {room.avatar_thumb_url ? (
                                <img src={room.avatar_thumb_url} alt={room.name} className={`w-full h-full object-cover ${room.type === 'direct' ? 'rounded-full' : 'rounded-lg'}`} />
                            ) : room.type === 'direct' ? (
                                <span className="text-sm font-bold">
                                    {room.name[0].toUpperCase()}
                                </span>
                            ) : (
                                <span className="material-symbols-outlined text-lg">
                                    group
                                </span>
                            )}
                            {room.type === 'direct' && room.other_user_id && (
                                <StatusDot online={presenceMap[room.other_user_id]?.online} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0 flex justify-between items-center">
                            <div>
                                <span className="truncate font-medium block">{linkifyText(room.name)}</span>
                                {room.type === 'group' && (
                                    <span className="text-[10px] text-slate-500 font-mono">#{room.code}</span>
                                )}
                            </div>
                            
                            {/* Loading Indicator or Badge */}
                            {loadingRoomId === room.id ? (
                                <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin"></div>
                            ) : (
                                room.unread_count > 0 && (
                                    <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-[20px] flex items-center justify-center">
                                        {room.unread_count > 99 ? '99+' : room.unread_count}
                                    </span>
                                )
                            )}
                        </div>
                    </button>
                ))}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-900/30 space-y-3 transition-colors duration-300">
                <button 
                    onClick={onCreateRoom}
                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 transition-all duration-200 transform hover:scale-[1.02]"
                >
                    <span className="material-symbols-outlined text-lg">add_circle</span>
                    New Room
                </button>
                <button 
                    onClick={onJoinRoom}
                    className="w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 transition-all duration-200 transform hover:scale-[1.02]"
                >
                    <span className="material-symbols-outlined text-lg">login</span>
                    Join Room
                </button>
            </div>

            
            {showShareProfile && (
                <ProfileShareModal 
                    user={user} 
                    onClose={() => setShowShareProfile(false)} 
                />
            )}

            {showMyProfile && (
                <ProfilePanel
                    userId={user.id}
                    onClose={() => setShowMyProfile(false)}
                    // No actions for self in sidebar
                />
            )}
        </div>
    );
}

import { useState, useEffect, useRef } from 'react';
import { usePresence } from '../context/PresenceContext';
import { useAppLock } from '../context/AppLockContext';
import { useTheme } from '../context/ThemeContext';
import StatusDot from './StatusDot';
import ProfileShareModal from './ProfileShareModal';
import ProfilePanel from './ProfilePanel';
import { linkifyText } from '../utils/linkify';
import SparkleLogo from './icons/SparkleLogo';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import SidebarContextMenu from './SidebarContextMenu';
import { ChatListSkeleton } from './SkeletonLoaders';
import PollIcon from './icons/PollIcon';


export default function Sidebar({ rooms, activeRoom, onSelectRoom, loadingRoomId, isLoading, onCreateRoom, onJoinRoom, user, onLogout, onRefresh }) {
    const { presenceMap, fetchStatuses } = usePresence();
    const { hasPasscode, lockApp } = useAppLock();
    const { theme, toggleTheme } = useTheme();
    const [tab, setTab] = useState('group'); // 'group' or 'direct'
    const [searchQuery, setSearchQuery] = useState('');
    const [archivedSearchQuery, setArchivedSearchQuery] = useState('');
    const [showShareProfile, setShowShareProfile] = useState(false);
    const [showMyProfile, setShowMyProfile] = useState(false);

    const myProfileRef = useRef(null);
    
    // [NEW] Archived State
    const [viewArchived, setViewArchived] = useState(false);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, room: null });
    
    // [NEW] Draft messages state - check localStorage
    const [drafts, setDrafts] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('cipher_drafts') || '{}');
        } catch {
            return {};
        }
    });
    
    // Update drafts when localStorage changes (on focus or custom event)
    useEffect(() => {
        const updateDrafts = () => {
            try {
                const storedDrafts = JSON.parse(localStorage.getItem('cipher_drafts') || '{}');
                setDrafts(storedDrafts);
            } catch {
                setDrafts({});
            }
        };
        
        // Listen for focus (when switching tabs)
        window.addEventListener('focus', updateDrafts);
        // Listen for custom event (when draft changes in same tab)
        window.addEventListener('draftsUpdated', updateDrafts);
        
        return () => {
            window.removeEventListener('focus', updateDrafts);
            window.removeEventListener('draftsUpdated', updateDrafts);
        };
    }, []);

    const filteredRooms = rooms.filter(r => {
        if (viewArchived) {
             if (!r.is_archived || r.type === 'ai') return false;
             if (!archivedSearchQuery.trim()) return true;
             return r.name.toLowerCase().includes(archivedSearchQuery.toLowerCase());
        }
        if (r.is_archived) return false; // Hide archived from main list

        if (r.type !== tab) return false;
        if (tab === 'ai') return true;
        if (!searchQuery.trim()) return true;
        return r.name.toLowerCase().includes(searchQuery.toLowerCase());
    });
    
    // Reset viewArchived when tab changes
    useEffect(() => {
        setViewArchived(false);
        setSearchQuery('');
        setArchivedSearchQuery('');
    }, [tab]);
    
    // Fetch status for direct chat users
    useEffect(() => {
        const userIds = rooms
            .filter(r => r.type === 'direct' && r.other_user_id)
            .map(r => r.other_user_id);
            
        if (userIds.length > 0) {
            fetchStatuses(userIds);
        }
    }, [rooms]);

    // [NEW] Auto-init AI session when switching to AI tab
    useEffect(() => {
        if (tab === 'ai') {
            const initAi = async () => {
                const existing = rooms.find(r => r.type === 'ai');
                if (existing) return;

                try {
                    const token = localStorage.getItem('token');
                    await fetch(`${import.meta.env.VITE_API_URL}/api/ai/session`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    // Dashboard socket 'room_added' handles the rest
                } catch (e) {
                    console.error(e);
                }
            };
            initAi();
        }
    }, [tab, rooms]);

    // [NEW] Helper to render preview with mentions highlighted
    const renderPreview = (content) => {
        if (!content) return 'No messages yet';
        
        // Split by mention pattern: @[Name](user:ID)
        const parts = content.split(/(@\[.*?\]\(user:\d+\))/g);
        
        return parts.map((part, i) => {
            const match = part.match(/@\[(.*?)\]\(user:(\d+)\)/);
            if (match) {
                const name = match[1];
                const id = match[2];
                // Check if it's me
                const isMe = String(id) === String(user.id);
                
                return (
                    <span 
                        key={i} 
                        className={isMe ? "text-violet-600 dark:text-violet-400 font-bold" : "font-semibold text-slate-700 dark:text-slate-300"}
                    >
                        @{name}
                    </span>
                );
            }
            // Regular text: render with emojis AND strip markdown
            const stripped = part
                .replace(/\*\*(.*?)\*\*/g, '$1') // Bold **
                .replace(/\*(.*?)\*/g, '$1')     // Italic *
                .replace(/__(.*?)__/g, '$1')     // Bold __
                .replace(/_(.*?)_/g, '$1')       // Italic _
                .replace(/`([^`]+)`/g, '$1')     // Code `
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Link [text](url)
                .replace(/^#+\s+/g, '');         // Heading #

            return renderTextWithEmojis(stripped, '1.65em');
        });
    };

    const [isLocking, setIsLocking] = useState(false);

    const handleLockClick = () => {
        setIsLocking(true);
        // Play animation (icon switch) then lock
        setTimeout(() => {
            lockApp();
            setIsLocking(false);
        }, 600);
    };

    return (
        <div className="w-full h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl transition-colors">
            {/* ... (Header) ... */}
            <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center bg-white/30 dark:bg-slate-900/30">
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                    <div 
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                        ref={myProfileRef}
                        onClick={() => setShowMyProfile(!showMyProfile)}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-500/20 overflow-hidden shrink-0 ${!user.avatar_thumb_url ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}>
                            {user.avatar_thumb_url ? (
                                <img src={user.avatar_thumb_url} alt="Me" className="w-full h-full object-cover" />
                            ) : (
                                user.display_name[0].toUpperCase()
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate transition-colors flex items-center gap-1">{renderTextWithEmojis(user.display_name)}</h2>
                            <div className="flex items-center gap-1">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium transition-colors truncate">
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
                        className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-all duration-200"
                        title="Logout"
                    >
                        <span className="material-symbols-outlined text-xl">logout</span>
                    </button>
                    
                    {hasPasscode && (
                        <div className="relative group/lock-container">
                             <button 
                                onClick={handleLockClick}
                                className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-violet-500 hover:bg-violet-100 dark:hover:text-violet-400 dark:hover:bg-violet-900/20 transition-all duration-200 relative"
                            >
                                <span className={`material-symbols-outlined text-xl transition-all duration-300 ${isLocking ? 'scale-110 text-violet-500' : ''}`}>
                                    {isLocking ? 'lock' : 'lock_open'}
                                </span>
                            </button>
                            
                            {/* Custom Tooltip */}
                            <div className="absolute top-12 right-0 w-max pointer-events-none opacity-0 group-hover/lock-container:opacity-100 transition-opacity duration-200 z-50">
                                <div className="bg-[#2a2a2a] text-white text-xs py-2 px-3 rounded-lg shadow-xl border border-white/5 relative">
                                    Tap to lock Cipher.
                                    {/* Triangle pointer */}
                                    <div className="absolute -top-1 right-3 w-2 h-2 bg-[#2a2a2a] border-t border-l border-white/5 transform rotate-45"></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 pb-2">
                <div className="flex p-1 bg-slate-100 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800/50 transition-colors">
                    <button 
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative ${tab === 'group' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        onClick={() => setTab('group')}
                    >
                        Groups
                        {rooms.filter(r => r.type === 'group' && r.unread_count > 0).length > 0 && (
                            <span className="absolute -top-1 -right-0 min-w-[18px] h-[18px] bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-white dark:border-slate-900">
                                {rooms.filter(r => r.type === 'group' && r.unread_count > 0).length > 99 ? '99+' : rooms.filter(r => r.type === 'group' && r.unread_count > 0).length}
                            </span>
                        )}
                    </button>
                    <button 
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative ${tab === 'direct' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        onClick={() => setTab('direct')}
                    >
                        Direct
                        {rooms.filter(r => r.type === 'direct' && r.unread_count > 0).length > 0 && (
                            <span className="absolute -top-1 -right-0 min-w-[18px] h-[18px] bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-white dark:border-slate-900">
                                {rooms.filter(r => r.type === 'direct' && r.unread_count > 0).length > 99 ? '99+' : rooms.filter(r => r.type === 'direct' && r.unread_count > 0).length}
                            </span>
                        )}
                    </button>
                    <button 
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center ${tab === 'ai' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        onClick={() => setTab('ai')}
                    >
                        <div className="relative inline-flex items-center">
                            AI
                            <div className="absolute -top-1.5 -right-2.5">
                                <SparkleLogo className={`w-3.5 h-3.5 ${tab === 'ai' ? 'opacity-100' : 'opacity-70 grayscale hover:grayscale-0 transition-all'}`} />
                            </div>
                        </div>
                    </button>
                </div>
                </div>

            

            
            {/* Search Bar - Only for Direct and Groups (Main View) */}
            {tab !== 'ai' && !viewArchived && (
                <div className="px-4 pb-2">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                            search
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={tab === 'group' ? "Search groups..." : "Search people..."}
                            className="w-full bg-slate-100 dark:bg-slate-950/50 border border-slate-300 dark:border-slate-700 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Archived Toggle Row - Moved Below Search */}
            {!viewArchived && rooms.some(r => r.is_archived) && tab !== 'ai' && !searchQuery && (
                <div className="px-4 pb-1">
                    <button 
                        onClick={() => setViewArchived(true)}
                        className="w-full flex items-center justify-between p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-md transition-colors text-sm font-medium"
                    >
                        <div className="flex items-center gap-2">
                             <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                             <span>Archived</span>
                        </div>
                        <span className="text-xs bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                            {rooms.filter(r => r.is_archived).length}
                        </span>
                    </button>
                </div>
            )}

            {/* Back from Archived Header + Search */}
            {viewArchived && (
                 <div className="flex flex-col border-b border-slate-100 dark:border-slate-800/50">
                     <div className="px-4 py-2 flex items-center gap-2">
                         <button 
                            onClick={() => setViewArchived(false)}
                            className="p-1 rounded-full transition-colors text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                         >
                             <span className="material-symbols-outlined text-sm">arrow_back</span>
                         </button>
                         <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Archived Chats</span>
                     </div>
                     <div className="px-4 pb-2">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                                search
                            </span>
                            <input
                                type="text"
                                value={archivedSearchQuery}
                                onChange={(e) => setArchivedSearchQuery(e.target.value)}
                                placeholder="Search archived..."
                                className="w-full bg-slate-100 dark:bg-slate-950/50 border border-slate-300 dark:border-slate-700 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                            />
                            {archivedSearchQuery && (
                                <button 
                                    onClick={() => setArchivedSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            )}
                        </div>
                    </div>
                 </div>
            )}

            {/* Room List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                {/* Show skeleton while loading */}
                {isLoading ? (
                    <ChatListSkeleton count={6} />
                ) : filteredRooms.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        {tab === 'ai' ? (
                            <div className="flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-3xl text-slate-300">smart_toy</span>
                                <span>No AI chats yet.</span>
                                <span className="text-xs text-slate-400">Initializing...</span>
                            </div>
                        ) : (
                            `No ${tab} chats yet.`
                        )}
                    </div>
                ) : (
                    filteredRooms.map(room => (
                    <div
                        key={room.id}
                        onClick={() => onSelectRoom(room)}
                        // disabled={loadingRoomId === room.id} // Div doesn't support disabled, handle via class or logic
                        className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all duration-200 group hover:translate-x-1 cursor-pointer select-none ${
                            activeRoom?.id === room.id 
                            ? 'bg-violet-100 dark:bg-violet-600/10 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/20 shadow-sm' 
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                        } ${loadingRoomId === room.id ? 'opacity-50 pointer-events-none' : ''}`}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (room.type === 'ai') return;
                            setContextMenu({
                                visible: true,
                                x: e.clientX,
                                y: e.clientY,
                                room: room
                            });
                        }}
                    >
                        <div className={`w-10 h-10 flex items-center justify-center ${room.type === 'direct' || room.type === 'ai' ? 'rounded-full' : 'rounded-lg p-2'} ${activeRoom?.id === room.id ? 'bg-violet-200 dark:bg-violet-500/20' : 'bg-slate-200 dark:bg-slate-800 group-hover:bg-slate-300 dark:group-hover:bg-slate-700'} transition-colors relative`}>
                            {room.avatar_thumb_url ? (
                                <img src={room.avatar_thumb_url} alt={room.name} className={`w-full h-full object-cover ${room.type === 'direct' ? 'rounded-full' : 'rounded-lg'}`} />
                            ) : room.type === 'direct' ? (
                                <span className="text-sm font-bold">
                                    {room.name[0].toUpperCase()}
                                </span>
                            ) : room.type === 'ai' ? (
                                <SparkleLogo className="w-6 h-6" />
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
                            <div className="min-w-0">
                                <span className="truncate font-medium block">
                                    {room.type === 'ai' ? 'Sparkle AI' : linkifyText(room.name)}
                                </span>
                                {room.type === 'group' && !room.last_message_content && !room.last_message_type && !drafts[room.id] ? (
                                    <span className="text-[10px] text-slate-500 font-mono">#{room.code}</span>
                                ) : drafts[room.id] ? (
                                    <div className="text-xs truncate flex items-center gap-1">
                                        <span className="text-orange-500 dark:text-orange-400 font-medium">Draft:</span>
                                        <span className="text-slate-500 dark:text-slate-400 truncate">
                                            {drafts[room.id].replace(/<[^>]*>/g, '').slice(0, 30)}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                                        {room.last_message_sender_id === user.id && room.type !== 'ai' && (
                                            <span className={`material-symbols-outlined text-[16px] ${
                                                room.last_message_status === 'seen' ? 'text-blue-500' :
                                                room.last_message_status === 'delivered' ? 'text-slate-400' :
                                                'text-slate-400'
                                            }`}>
                                                {room.last_message_status === 'sent' ? 'check' : 'done_all'}
                                            </span>
                                        )}
                                        <span className="truncate flex-1">
                                            {room.last_message_type === 'image' ? (
                                                <span className="flex items-center gap-1">
                                                    {room.last_message_is_view_once ? (
                                                        (room.last_message_viewed_by && room.last_message_viewed_by.length > 0) ? (
                                                             <>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-500 dark:text-slate-400 shrink-0">
                                                                    <path d="M12 22 A10 10 0 0 1 12 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                                    <path d="M12 2 A10 10 0 0 1 12 22" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
                                                                </svg>
                                                                <span className="truncate text-slate-500 dark:text-slate-400">Opened</span>
                                                             </>
                                                        ) : (
                                                            <>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-500 dark:text-slate-400 shrink-0">
                                                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
                                                                    <path d="M10.5 9L12 7.5V16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                                                </svg>
                                                                <span className="truncate">Photo</span>
                                                            </>
                                                        )
                                                    ) : (
                                                        <>
                                                            <span className="material-symbols-outlined text-[18px] translate-y-[0.5px]">image</span>
                                                            <span className="truncate">{room.last_message_caption ? renderTextWithEmojis(room.last_message_caption, '1.65em') : 'Photo'}</span>
                                                        </>
                                                    )}
                                                </span>
                                            ) :
                                             room.last_message_type === 'file' ? (
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[18px] translate-y-[0.5px]">description</span>
                                                        <span className="truncate">
                                                            {room.last_message_file_name || 'File'}
                                                            {room.last_message_caption ? ` • ${renderTextWithEmojis(room.last_message_caption, '1.65em')}` : ''}
                                                        </span>
                                                </span>
                                             ) :
                                             room.last_message_type === 'location' ? (
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[18px] translate-y-[0.5px]">location_on</span>
                                                    <span>Location</span>
                                                </span>
                                             ) :
                                             room.last_message_type === 'audio' ? 'Sent an audio' :
                                             room.last_message_type === 'gif' ? 'Sent a GIF' :
                                             room.last_message_type === 'poll_vote' ? (
                                                 <span className="flex items-center gap-1">
                                                     <span className="shrink-0">
                                                         {room.last_message_sender_id === user.id ? 'You' : renderTextWithEmojis(room.last_message_sender_name, '1.65em')}
                                                     </span>
                                                     <span>voted in:</span>
                                                     <PollIcon className="w-4 h-4 shrink-0" />
                                                     <span className="truncate">{renderTextWithEmojis(room.last_message_poll_question, '1.1em') || 'Poll'}</span>
                                                 </span>
                                             ) :
                                             room.last_message_type === 'poll' ? (
                                                 <span className="flex items-center gap-1">
                                                     {room.type === 'group' && room.last_message_sender_name && (
                                                        <span className="shrink-0">{room.last_message_sender_id === user.id ? 'You' : renderTextWithEmojis(room.last_message_sender_name, '1.65em')}:</span>
                                                    )}
                                                     <PollIcon className="w-4 h-4 shrink-0" />
                                                     <span className="truncate">{renderTextWithEmojis(room.last_message_poll_question, '1.1em') || 'Poll'}</span>
                                                 </span>
                                             ) :
                                             (room.last_message_content && room.last_message_content.includes('pinned a message')) ? (
                                                 <span className="flex items-center gap-1">
                                                     <span className="material-symbols-outlined text-[16px] translate-y-[0.5px]">push_pin</span>
                                                     <span>
                                                         {room.last_message_sender_id === user.id 
                                                             ? 'You pinned a message' 
                                                             : `${room.last_message_sender_name || 'Someone'} pinned a message`}
                                                     </span>
                                                 </span>
                                             ) :
                                             renderPreview(room.last_message_content)}
                                        </span>
                                    </div>
                                )}
                            </div>
                            </div>

                            {/* Right Side Column: Menu + Badge */}
                            <div className="flex flex-col items-end gap-1 ml-2">
                                {/* Three-dot Menu Button - Shows on Hover */}
                                {room.type !== 'ai' && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setContextMenu({
                                                visible: true,
                                                x: e.clientX,
                                                y: e.clientY,
                                                room: room
                                            });
                                        }}
                                        className={`w-5 h-5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 flex items-center justify-center transition-all shrink-0 mb-auto cursor-pointer ${
                                            contextMenu.visible && contextMenu.room?.id === room.id 
                                            ? 'opacity-100 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' 
                                            : 'opacity-0 group-hover:opacity-100'
                                        }`}
                                        title="More options"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                                    </div>
                                )}

                                {/* Loading Indicator or Badge - At Bottom */}
                                {loadingRoomId === room.id ? (
                                    <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin"></div>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        {/* Pinned Icon */}
                                        {room.is_pinned && (
                                            <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transform rotate-45">push_pin</span>
                                        )}
                                         {/* Mention Badge */}
                                         {room.unread_count > 0 && room.last_message_content && room.last_message_content.includes(`(user:${user.id})`) && (
                                            <span className="bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center shadow-sm animate-pulse">
                                                <span className="material-symbols-outlined text-[14px]">alternate_email</span>
                                            </span>
                                        )}

                                        {room.unread_count > 0 && (
                                            <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-[20px] flex items-center justify-center">
                                                {room.unread_count > 99 ? '99+' : room.unread_count}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                    </div>
                ))
                )}

            </div>

            {/* Context Menu */}
            {contextMenu.visible && (
                <SidebarContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu({ ...contextMenu, visible: false })}
                    options={[
                        !contextMenu.room.is_archived && {
                            label: contextMenu.room.is_pinned ? 'Unpin' : 'Pin',
                            icon: 'push_pin',
                            onClick: async () => {
                                try {
                                    const action = contextMenu.room.is_pinned ? 'unpin' : 'pin';
                                    const token = localStorage.getItem('token');
                                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${contextMenu.room.id}/${action}`, {
                                        method: 'POST',
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    const data = await res.json();
                                    
                                    if (!res.ok) {
                                        if (data.error && (data.error.includes('pin up to 8') || data.error.includes('8 chats'))) {
                                            alert(data.error);
                                        } else {
                                            console.error(data.error);
                                        }
                                        return;
                                    }

                                    // Trigger refresh
                                    if (onRefresh) onRefresh();
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                        },
                        {
                            label: contextMenu.room.is_archived ? 'Unarchive' : 'Archive',
                            icon: contextMenu.room.is_archived ? 'unarchive' : 'inventory_2',
                            onClick: async () => {
                                try {
                                    const action = contextMenu.room.is_archived ? 'unarchive' : 'archive';
                                    const token = localStorage.getItem('token');
                                    await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${contextMenu.room.id}/${action}`, {
                                        method: 'POST',
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    // Trigger refresh
                                    if (onRefresh) onRefresh();
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                        }
                    ].filter(Boolean)}
                />
            )}

            {/* Actions */}
            <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-900/30 space-y-3 transition-colors duration-300">
                {tab === 'ai' ? (
                   <div className="text-center text-xs text-slate-400">
                       AI Assistant is ready
                   </div>
                ) : (
                    <>
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
                    </>
                )}
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

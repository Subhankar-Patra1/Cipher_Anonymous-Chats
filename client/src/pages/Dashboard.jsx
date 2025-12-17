import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import AIChatWindow from '../components/AIChatWindow';
import CreateRoomModal from '../components/CreateRoomModal';
import JoinRoomModal from '../components/JoinRoomModal';
import GroupInfoModal from '../components/GroupInfoModal';
import LogoutModal from '../components/LogoutModal';
import io from 'socket.io-client';
import { PresenceProvider } from '../context/PresenceContext';

import { AiChatProvider } from '../context/AiChatContext';
import notificationSound from '../assets/notification.ogg';
import sentSound from '../assets/sent.ogg';

export default function Dashboard() {
    const { user, token, logout, updateUser } = useAuth();
    const [rooms, setRooms] = useState([]);
    const [activeRoom, setActiveRoom] = useState(null);
    const [loadingRoomId, setLoadingRoomId] = useState(null); // [NEW] Loading state for chat switching
    const [socket, setSocket] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);

    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [highlightMessageId, setHighlightMessageId] = useState(null); // [NEW] Highlight message
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const activeRoomRef = useRef(null);
    
    // Resize Logic
    const [sidebarWidth, setSidebarWidth] = useState(288); // Default w-72 (288px)
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef(null);

    // [NEW] Helper to sort rooms: Pinned first (by pin time), then by last message/creation time
    const sortRooms = (roomsToSort) => {
        return [...roomsToSort].sort((a, b) => {
            // 1. Pinned
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;

            if (a.is_pinned && b.is_pinned) {
                 // Sort by pin time (desc) - "Stack" behavior
                 const pinTimeA = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
                 const pinTimeB = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
                 
                 if (pinTimeA !== pinTimeB) {
                     return pinTimeB - pinTimeA;
                 }
                 // Tie-breaker: Fallback to last message time
            }

            // 2. Archived (Though archived usually hidden or filtered, we sort them last just in case)
            if (a.is_archived && !b.is_archived) return 1;
            if (!a.is_archived && b.is_archived) return -1;
            
            // 3. Time (desc)
            const timeA = new Date(a.last_message_at || a.created_at).getTime();
            const timeB = new Date(b.last_message_at || b.created_at).getTime();
            return timeB - timeA;
        });
    };

    const startResizing = useCallback(() => setIsResizing(true), []);
    const stopResizing = useCallback(() => setIsResizing(false), []);

    const resize = useCallback((mouseMoveEvent) => {
        if (isResizing) {
            const newWidth = mouseMoveEvent.clientX;
            if (newWidth >= 200 && newWidth <= 600) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        const handleWindowResize = () => {
            // Force re-render on resize boundaries
             setSidebarWidth(prev => prev); 
        };
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        window.addEventListener("resize", handleWindowResize); // [NEW] Listen to resize
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
            window.removeEventListener("resize", handleWindowResize);
        };
    }, [resize, stopResizing]);

    useEffect(() => {
        activeRoomRef.current = activeRoom;
        setShowGroupInfo(false); // Close group info modal when changing rooms
    }, [activeRoom]);

    const fetchRooms = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setRooms(data);
                }
            }
        } catch (err) {
            console.error(err);
        }
    }, [token]);

    // Fetch rooms on mount
    useEffect(() => {
        fetchRooms();
    }, [fetchRooms]);

    useEffect(() => {
        const newSocket = io(import.meta.env.VITE_API_URL, {
            auth: { token }
        });

        newSocket.on('connect', () => {
            console.log('[DEBUG] Connected to socket via Dashboard', newSocket.id);
        });

        newSocket.on('connect_error', (err) => {
            console.error('[DEBUG] Socket connection error:', err.message);
        });

        // Helper moved to component scope


        newSocket.on('room_added', (newRoom) => {
            console.log('[DEBUG-CLIENT] room_added received:', newRoom);
            setRooms(prev => {
                if (prev.find(r => r.id === newRoom.id)) return prev;
                return sortRooms([newRoom, ...prev]);
            });
            newSocket.emit('join_room', newRoom.id);
        });

        // ... existing listeners ...

        // [NEW] Force refresh rooms list (fallback for syncing)
        newSocket.on('rooms:refresh', () => {
             console.log('[DEBUG-CLIENT] rooms:refresh received. Fetching data...');
             const fetchData = async () => {
                try {
                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setRooms(data); // API already sorts, but maybe safer to sort client side too? API result is usually trusted.
                    }
                } catch (err) {
                    console.error(err);
                }
            };
            fetchData();
        });

        newSocket.on('new_message', (msg) => {
            // [NEW] Play notification sound
            if (msg.user_id !== user.id) {
                const audio = new Audio(notificationSound);
                audio.play().catch(e => console.log("Audio play error:", e));
            } else {
                // [NEW] Play sent sound
                const audio = new Audio(sentSound);
                audio.play().catch(e => console.log("Audio play error:", e));
            }

            setRooms(prev => {
                let updatedRooms = [...prev];
                const roomIndex = updatedRooms.findIndex(r => String(r.id) === String(msg.room_id));
                
                // [NEW] Emit delivered globally if received (e.g. in sidebar)
                if (String(msg.user_id) !== String(user.id)) {
                    console.log('[DEBUG-CLIENT] Emitting global message_delivered for msg:', msg.id);
                    newSocket.emit('message_delivered', { messageId: msg.id, roomId: msg.room_id });
                }

                if (roomIndex > -1) {
                     const room = { ...updatedRooms[roomIndex] };
                     // Update unread count if not active
                     if (activeRoomRef.current?.id !== room.id) {
                         room.unread_count = (room.unread_count || 0) + 1;
                     }
                     // Update last message preview
                     room.last_message_content = msg.content;
                     room.last_message_type = msg.type;
                     room.last_message_sender_id = msg.user_id;
                     room.last_message_status = msg.status || 'sent';
                     room.last_message_id = msg.id;
                     room.last_message_caption = msg.caption;
                     room.last_message_at = new Date().toISOString(); // Update timestamp for sorting

                     updatedRooms[roomIndex] = room;
                     // Re-sort using our helper
                     return sortRooms(updatedRooms);
                }
                return updatedRooms;
            });
        });

        // [NEW] Avatar Updates
        newSocket.on('user:avatar:updated', ({ userId, avatar_url, avatar_thumb_url }) => {
             console.log('[DEBUG] Avatar updated for user', userId, avatar_thumb_url);
             setRooms(prev => prev.map(r => {
                 if (r.type === 'direct' && String(r.other_user_id) === String(userId)) {
                     return { ...r, avatar_thumb_url };
                 }
                 return r;
             }));
             
             setActiveRoom(prev => {
                 if (prev && prev.type === 'direct' && String(prev.other_user_id) === String(userId)) {
                     return { ...prev, avatar_thumb_url, avatar_url }; // Update both
                 }
                 return prev;
             });
        });

        newSocket.on('user:avatar:deleted', ({ userId }) => {
             setRooms(prev => prev.map(r => {
                 if (r.type === 'direct' && String(r.other_user_id) === String(userId)) {
                     return { ...r, avatar_thumb_url: null };
                 }
                 return r;
             }));
             
             setActiveRoom(prev => {
                 if (prev && prev.type === 'direct' && String(prev.other_user_id) === String(userId)) {
                     return { ...prev, avatar_thumb_url: null, avatar_url: null };
                 }
                 return prev;
             });
        });

        // [NEW] Chat cleared/deleted events
        newSocket.on('messages_status_update', ({ roomId, messageIds, status }) => {
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(roomId) && r.last_message_id && messageIds.map(String).includes(String(r.last_message_id))) {
                    return { ...r, last_message_status: status };
                }
                return r;
            }));
        });

        newSocket.on('chat:cleared', ({ roomId }) => {
            // Update rooms list
             setRooms(prev => prev.map(r => 
                String(r.id) === String(roomId) ? { 
                    ...r, 
                    unread_count: 0, 
                    initialMessages: [],
                    last_message_content: null,
                    last_message_type: null,
                    last_message_sender_id: null,
                    last_message_type: null,
                    last_message_sender_id: null,
                    last_message_status: null,
                    last_message_id: null
                } : r
            ));
            
            // Update active room if matches
            setActiveRoom(prev => {
                if (prev && String(prev.id) === String(roomId)) {
                    return { ...prev, initialMessages: [] };
                }
                return prev;
            });
        });

        newSocket.on('chat:deleted', ({ roomId }) => {
            setRooms(prev => prev.filter(r => String(r.id) !== String(roomId)));
            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(roomId)) {
                setActiveRoom(null);
            }
        });

        // [NEW] Refresh rooms if last message is deleted (for everyone)
        newSocket.on('message_deleted', ({ messageId, roomId }) => {
             // Check if the deleted message was the last one shown in sidebar
             // determining from current state is hard inside callback due to closure
             // But setRooms(prev => ...) gives access to latest.
             // However, to trigger fetchRooms(), we need to call it.
             // We can just call fetchRooms(). It's debounced/throttled or just safe enough.
             // But let's check rooms state first if possible.
             // Actually, simplest is just to refresh.
             fetchRooms();
        });

        // [NEW] Force refresh rooms list (fallback for syncing)
        newSocket.on('rooms:refresh', () => {
            console.log('[DEBUG] Received rooms:refresh request');
            fetchRooms();
        });

        // [NEW] Group Avatar/Bio Updates
        newSocket.on('room:updated', (data) => {
            // data matches: { roomId, avatar_url, avatar_thumb_url, bio, etc }
            console.log('[DEBUG] Room updated:', data);
            
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(data.roomId)) {
                    return { ...r, ...data }; // Merge updates (avatar, bio, etc)
                }
                return r;
            }));

            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(data.roomId)) {
                 setActiveRoom(prev => ({ ...prev, ...data }));
            }
        });

        // [NEW] Group Permissions Updated
        newSocket.on('group:permissions:updated', ({ groupId, permissions }) => {
            console.log('[DEBUG] Permissions updated:', groupId, permissions);
            
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(groupId)) {
                    return { ...r, ...permissions }; // Merge permissions (send_mode, etc) into room
                }
                return r;
            }));

            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(groupId)) {
                 setActiveRoom(prev => ({ ...prev, ...permissions }));
            }
        });

        // [NEW] User Profile Updates (Display Name)
        newSocket.on('user:profile:updated', ({ userId, display_name }) => {
            console.log('[DEBUG] User profile updated:', userId, display_name);
            
            if (String(userId) === String(user.id)) {
                updateUser({ display_name });
            }

            // 1. Update Sidebar Rooms (for DMs)
            setRooms(prev => prev.map(r => {
                if (r.type === 'direct' && String(r.other_user_id) === String(userId)) {
                    // Update the derived name for DMs
                    return { 
                        ...r, 
                        name: display_name,
                        other_user_name: display_name 
                    };
                }
                return r;
            }));

            // 2. Update Active Room if it is a DM with this user
            setActiveRoom(prev => {
                if (prev && prev.type === 'direct' && String(prev.other_user_id) === String(userId)) {
                    return { 
                        ...prev, 
                        name: display_name,
                        other_user_name: display_name 
                    };
                }
                return prev;
            });
        });

        setSocket(newSocket);

        return () => newSocket.close();
    }, [token]);

    // Join rooms when they are loaded or socket connects
    useEffect(() => {
        if (socket && rooms.length > 0) {
            rooms.forEach(room => {
                socket.emit('join_room', room.id);
            });
        }
    }, [socket, rooms]);

    // Consolidated Data Fetching
    useEffect(() => {
        if (!token) return;

        console.log('Dashboard mounted/token changed. Fetching data...');
        fetchRooms();

        const handlePendingInvite = async () => {
             const params = new URLSearchParams(window.location.search);
             const joinCode = params.get('joinCode');
             const chatUser = params.get('chatUser');
 
             if (joinCode) {
                 window.history.replaceState({}, document.title, window.location.pathname);
                 await handleJoinRoom(joinCode);
                 return;
             }
 
             if (chatUser) {
                 window.history.replaceState({}, document.title, window.location.pathname);
                 try {
                     const searchRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/search?q=${chatUser}`, {
                         headers: { Authorization: `Bearer ${token}` }
                     });
                     const users = await searchRes.json();
                     const target = users.find(u => u.username === chatUser);
                     if (target) {
                         await handleCreateRoom({ type: 'direct', targetUserId: target.id });
                     }
                 } catch (err) {
                     console.error('Error resolving invite:', err);
                 }
                 return;
             }
        };

        (async () => {
             const params = new URLSearchParams(window.location.search);
             if (params.get('joinCode') || params.get('chatUser')) {
                 await handlePendingInvite(); 
             }
        })();
    }, [token, fetchRooms]); // fetchRooms in dep array? It depends on token so stable.

    // Re-implement handlePendingInvite since we cut it in the diff?
    // Wait, the original block lines 297-355 was large. 
    // I need to be careful not to lose handlePendingInvite logic.
    // Let me rewrite the whole block effectively.

    const markAsRead = async (roomId) => {
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/read`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state
            setRooms(prev => prev.map(r => 
                r.id === roomId ? { ...r, unread_count: 0 } : r
            ));
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (activeRoom) {
            markAsRead(activeRoom.id);
        }
    }, [activeRoom]);

    // [NEW] Helper to hydrate messages (resolve replies)
    const hydrateMessages = (messages) => {
        const byId = new Map(messages.map(m => [m.id, m]));
        return messages.map(m => {
            if (!m.reply_to_message_id) return m;

            const original = byId.get(m.reply_to_message_id);
            if (!original) return m;

            const raw = original.content || "";
            const normalized = raw.replace(/\s+/g, " ").trim();
            const maxLen = 120;
            const snippet = normalized.length > maxLen
                ? normalized.slice(0, maxLen) + "…"
                : normalized;

            return {
                ...m,
                replyTo: {
                    id: original.id,
                    sender: original.display_name || original.username,
                    text: snippet,
                },
            };
        });
    };

    // [NEW] Handle Room Selection with Pre-fetching
    const handleSelectRoom = async (room) => {
        if (activeRoom?.id === room.id) return; // Already valid
        
        setLoadingRoomId(room.id);
        
        // [FIX] Switch immediately for UX, show loading in ChatWindow
        setActiveRoom(room);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages`, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (res.ok) {
                const data = await res.json();
                const hydrated = hydrateMessages(data);
                
                // Only update if user hasn't switched away
                // relying on activeRoomRef or checking current activeRoom state if we were inside a setter
                // But setActiveRoom(prev => ...) is safer
                setActiveRoom(prev => {
                    if (prev && String(prev.id) === String(room.id)) {
                        return { ...prev, initialMessages: hydrated };
                    }
                    return prev;
                });
            } else {
                console.error("Failed to fetch messages");
                // activeRoom is already set, so it stays valid but empty.
                // Could handle error state inside ChatWindow if needed.
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingRoomId(null);
        }
    };

    const handleCreateRoom = async (roomData) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify(roomData)
            });
            if (res.ok) {
                const newRoom = await res.json();
                
                // Check if room already exists in list
                const exists = rooms.find(r => r.id === newRoom.id);
                if (!exists) {
                    setRooms(prev => sortRooms([newRoom, ...prev]));
                }
                
                setShowCreateModal(false);
                await handleSelectRoom(newRoom);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleJoinRoom = async (code) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/join`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ code })
            });
            const newRoom = await res.json();
            if (res.ok) {
                // Check if already in list
                if (!rooms.find(r => r.id === newRoom.id)) {
                    setRooms(prev => sortRooms([newRoom, ...prev]));
                }
                setShowJoinModal(false);
                
                // Fetch messages immediately so the user sees the "You joined" message
                await handleSelectRoom(newRoom);
            } else {
                alert(newRoom.error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // [NEW] Handle Go To Message
    const handleGoToMessage = (messageId) => {
        setShowGroupInfo(false);
        setHighlightMessageId(messageId);
        // Reset after a delay so it can be re-triggered if needed, 
        // essentially handled by the consumer clearing it or just change detection
        setTimeout(() => setHighlightMessageId(null), 2000); 
    };

    return (
        <PresenceProvider socket={socket}>
            <AiChatProvider socket={socket}>
        <div className={`fixed inset-0 h-[100dvh] w-full bg-gray-50 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden flex ${isResizing ? 'select-none cursor-col-resize' : ''} animate-dashboard-entry transition-colors`}>
            {/* Mobile: Sidebar hidden if activeRoom exists. Desktop: Always visible */}
            <div 
                className={`
                    ${activeRoom ? 'hidden md:flex' : 'flex'} 
                    h-full z-10 shrink-0
                    w-full md:w-[var(--sidebar-width)]
                `}
                style={{ '--sidebar-width': `${sidebarWidth}px` }}
            >
                <Sidebar 
                    rooms={rooms} 
                    activeRoom={activeRoom} 
                    onSelectRoom={handleSelectRoom} // [MODIFIED] Use new handler
                    loadingRoomId={loadingRoomId}   // [NEW] Pass loading state
                    onCreateRoom={() => setShowCreateModal(true)}
                    onJoinRoom={() => setShowJoinModal(true)}
                    user={user}
                    onRefresh={fetchRooms}           // [NEW] Pass refresh handler
                    onLogout={() => setShowLogoutModal(true)}
                />
            </div>

            {/* Drag Handle (Desktop Only) */}
            {!showGroupInfo && (
                <div 
                    className="hidden md:block w-1 hover:w-1.5 cursor-col-resize bg-slate-200 dark:bg-slate-800 hover:bg-violet-500 transition-all z-10 shrink-0"
                    onMouseDown={startResizing}
                />
            )}
            
            {/* Mobile: Chat visible if activeRoom exists. Desktop: Always visible (flex-1) */}
            <div className={`
                ${activeRoom ? 'flex' : 'hidden md:flex'} 
                flex-1 flex-col h-full bg-gray-50 dark:bg-slate-950 relative z-0 min-w-0 overflow-hidden transition-colors duration-300
            `}>
                {activeRoom ? (
                    activeRoom.type === 'ai' ? (
                        <AIChatWindow
                            key={activeRoom.id}
                            socket={socket}
                            room={activeRoom}
                            user={user}
                            isLoading={loadingRoomId === activeRoom.id}
                            onBack={() => setActiveRoom(null)}
                        />
                    ) : (
                        <ChatWindow 
                            key={activeRoom.id} // [NEW] Force re-mount for new room
                            socket={socket} 
                            room={activeRoom} // contains initialMessages now
                            user={user} 
                            isLoading={loadingRoomId === activeRoom.id}
                            onBack={() => setActiveRoom(null)}
                            showGroupInfo={showGroupInfo}
                            setShowGroupInfo={setShowGroupInfo}
                            highlightMessageId={highlightMessageId} // [NEW]
                            onGoToMessage={handleGoToMessage} // [NEW]
                        />
                    )
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-slate-950 relative overflow-hidden">
                        {/* Background Ambient Effects */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse-slow mix-blend-multiply dark:mix-blend-screen" />
                            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow mix-blend-multiply dark:mix-blend-screen" style={{ animationDelay: '1s' }} />
                        </div>

                        <div className="relative z-10 text-center p-8 max-w-lg animate-fade-in-up">
                            {/* Animated Illustration */}
                            <div className="mb-8 relative inline-block group cursor-default">
                                <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full scale-0 group-hover:scale-110 transition-transform duration-500" />
                                <div className="relative w-32 h-32 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex items-center justify-center border border-slate-200 dark:border-slate-800 transform rotate-3 group-hover:rotate-6 transition-transform duration-500">
                                    <div className="absolute inset-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl" />
                                    <div className="flex gap-1 animate-bounce-slight">
                                        <div className="w-2 h-2 rounded-full bg-violet-500" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-indigo-500" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-sky-500" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500 absolute bottom-6 right-6 transform -rotate-12 group-hover:rotate-0 transition-transform">
                                        send
                                    </span>
                                </div>
                                {/* Floating Elements */}
                                <div className="absolute -top-4 -right-4 bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 animate-float" style={{ animationDelay: '0.5s' }}>
                                    <span className="material-symbols-outlined text-green-500 text-lg">lock</span>
                                </div>
                                <div className="absolute -bottom-2 -left-6 bg-white dark:bg-slate-800 px-3 py-1 rounded-full shadow-lg border border-slate-100 dark:border-slate-700 animate-float" style={{ animationDelay: '1.5s' }}>
                                    <span className="text-xs font-mono text-slate-500">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1" />
                                        Online
                                    </span>
                                </div>
                            </div>

                            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-violet-800 to-slate-900 dark:from-white dark:via-violet-200 dark:to-white mb-3">
                                Welcome, {user?.display_name || 'Guest'}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-lg mb-8 leading-relaxed">
                                Select a conversation from the sidebar or start a new room to begin secure messaging.
                            </p>

                            <div className="flex flex-wrap justify-center gap-4">
                                <button 
                                    onClick={() => setShowCreateModal(true)}
                                    className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all transform hover:-translate-y-0.5 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-xl">add</span>
                                    New Room
                                </button>
                                <button 
                                    onClick={() => setShowJoinModal(true)}
                                    className="px-6 py-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium border border-slate-200 dark:border-slate-700 shadow-sm transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-xl">login</span>
                                    Join Room
                                </button>
                            </div>
                        </div>
                        
                        <div className="absolute bottom-8 left-0 w-full text-center">
                            <p className="text-xs text-slate-400 dark:text-slate-600 font-mono flex items-center justify-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                                <span className="material-symbols-outlined text-sm">encrypted</span>
                                End-to-end encrypted • Zero logs
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <CreateRoomModal 
                    onClose={() => setShowCreateModal(false)} 
                    onCreate={handleCreateRoom} 
                />
            )}

            {showJoinModal && (
                <JoinRoomModal 
                    onClose={() => setShowJoinModal(false)} 
                    onJoin={handleJoinRoom} 
                />
            )}

            <LogoutModal 
                isOpen={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                onConfirm={() => {
                    setShowLogoutModal(false);
                    logout();
                }}
            />

            {showGroupInfo && activeRoom && (
                <GroupInfoModal 
                    room={activeRoom} 
                    socket={socket}
                    onClose={() => setShowGroupInfo(false)}
                    onGoToMessage={handleGoToMessage} // [NEW]
                    onLeave={async () => {
                         if (!confirm('Are you sure you want to leave this group?')) return;
                         try {
                             await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${activeRoom.id}/leave`, {
                                 method: 'POST',
                                 headers: { Authorization: `Bearer ${token}` }
                             });
                             window.location.reload(); 
                         } catch (err) {
                             console.error(err);
                         }
                    }}
                    // Kick would be handled within modal or via props if needed, but GroupInfoModal handles it internally mostly or via context
                />
            )}
        </div>
        </AiChatProvider>
        </PresenceProvider>
    );
}

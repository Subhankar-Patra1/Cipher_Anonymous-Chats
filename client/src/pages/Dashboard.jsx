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
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const activeRoomRef = useRef(null);
    
    // Resize Logic
    const [sidebarWidth, setSidebarWidth] = useState(288); // Default w-72 (288px)
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef(null);

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
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
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

        newSocket.on('room_added', (newRoom) => {
            console.log('[DEBUG-CLIENT] room_added received:', newRoom);
            setRooms(prev => {
                if (prev.find(r => r.id === newRoom.id)) return prev;
                return [newRoom, ...prev];
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
                        setRooms(data);
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

            setRooms(prev => prev.map(r => {
                if (r.id === msg.room_id) {
                    if (activeRoomRef.current?.id !== r.id) {
                        return { ...r, unread_count: (r.unread_count || 0) + 1 };
                    }
                }
                return r;
            }));
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
        newSocket.on('chat:cleared', ({ roomId }) => {
            // Update rooms list
             setRooms(prev => prev.map(r => 
                String(r.id) === String(roomId) ? { ...r, unread_count: 0, initialMessages: [] } : r
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
                    setRooms([newRoom, ...rooms]);
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
                    setRooms(prev => [newRoom, ...prev]);
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

    return (
        <PresenceProvider socket={socket}>
            <AiChatProvider socket={socket}>
        <div className={`fixed inset-0 h-[100dvh] w-full bg-gray-50 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden flex ${isResizing ? 'select-none cursor-col-resize' : ''} animate-dashboard-entry transition-colors`}>
            {/* Mobile: Sidebar hidden if activeRoom exists. Desktop: Always visible */}
            <div 
                className={`
                    ${activeRoom ? 'hidden md:flex' : 'flex'} 
                    h-full z-10 shrink-0
                `}
                style={{ width: window.innerWidth >= 768 ? sidebarWidth : '100%' }}
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
                        />
                    )
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-500 dark:text-slate-400">
                        <div className="text-center">
                            <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-700 mb-4 transition-colors">chat_bubble_outline</span>
                            <p>Select a room to start chatting</p>
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

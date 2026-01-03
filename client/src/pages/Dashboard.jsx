import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
// [MODIFIED] Use context, don't provide it here
import { useChatLock } from '../context/ChatLockContext';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import AIChatWindow from '../components/AIChatWindow';
import CreateRoomModal from '../components/CreateRoomModal';
import JoinRoomModal from '../components/JoinRoomModal';
import GroupInfoModal from '../components/GroupInfoModal';
import LogoutModal from '../components/LogoutModal';
import NotificationPermissionBanner from '../components/NotificationPermissionBanner';
import ChatAreaLockGuard from '../components/ChatAreaLockGuard';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import io from 'socket.io-client';
import { PresenceProvider } from '../context/PresenceContext';

import { AiChatProvider } from '../context/AiChatContext';
import notificationSound from '../assets/notification.ogg';
import sentSound from '../assets/sent.ogg';

// Helper to strip emoji characters from text (for clean notification display)
const stripEmojis = (text) => {
    if (!text) return '';
    // Remove emoji characters (Unicode ranges for emojis)
    return text
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE0F}]/gu, '')
        .trim();
};

// Helper to generate notification preview text
const getMessagePreview = (msg) => {
    // If there's content, try to show it regardless of type
    if (msg.content) {
        // Strip only HTML tags, keep emojis
        const text = (msg.content.replace(/<[^>]*>/g, '') || '').trim();
        if (text) {
            return text.length > 80 ? text.slice(0, 80) + '...' : text;
        }
    }
    
    // Fallback based on type
    switch(msg.type) {
        case 'text': return 'Message';
        case 'image': return msg.caption || 'Photo';
        case 'video': return msg.caption || 'Video';
        case 'audio': return 'Voice message';
        case 'file': return msg.file_name || 'Document';
        case 'gif': return 'GIF';
        case 'sticker': return 'Sticker';
        case 'system': return msg.content; // [NEW] System message preview
        default: return msg.caption || 'New message';
    }
};




export default function Dashboard() {
    const { user, token, logout, updateUser } = useAuth();
    const { showNotification, canNotify } = useNotification();
    const [rooms, setRooms] = useState([]);
    const [activeRoom, setActiveRoom] = useState(null);
    const [loadingRoomId, setLoadingRoomId] = useState(null); // [NEW] Loading state for chat switching
    const [isLoadingRooms, setIsLoadingRooms] = useState(true); // [NEW] Initial loading state
    const [socket, setSocket] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);

    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [highlightMessageId, setHighlightMessageId] = useState(null); // [NEW] Highlight message
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const activeRoomRef = useRef(null);
    const canNotifyRef = useRef(canNotify); // Track current notification state for socket handler

    // [NEW] Get pending unlock status for mobile layout
    const { pendingUnlockRoom } = useChatLock();
    
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

    // Keep canNotifyRef in sync with canNotify (fixes stale closure in socket handler)
    useEffect(() => {
        canNotifyRef.current = canNotify;
    }, [canNotify]);

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

    const fetchRooms = useCallback(async (showLoading = false) => {
        if (!token) return;
        if (showLoading) setIsLoadingRooms(true);
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
        } finally {
            setIsLoadingRooms(false);
        }
    }, [token]);

    // Fetch rooms on mount
    useEffect(() => {
        fetchRooms(true); // Show loading skeleton on initial load
    }, [fetchRooms]);

    useEffect(() => {
        const newSocket = io(import.meta.env.VITE_API_URL, {
            auth: { token }
        });

        newSocket.on('connect', () => {

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
            const isSilent = msg.meta?.silent;

            // [NEW] Play notification sound (Only if not silent)
            if (msg.user_id !== user.id && !isSilent) {
                const audio = new Audio(notificationSound);
                audio.play().catch(e => console.log("Audio play error:", e));
                
                // [NEW] Show desktop notification if tab is hidden or different room
                const isTabHidden = document.hidden;
                const isDifferentRoom = activeRoomRef.current?.id !== msg.room_id;
                
                if (canNotifyRef.current && (isTabHidden || isDifferentRoom)) {
                    // Get room info
                    const senderRoom = rooms.find(r => String(r.id) === String(msg.room_id));
                    
                    // Don't show notifications for archived chats
                    if (senderRoom?.is_archived) {
                        return;
                    }
                    
                    // Get sender name (keep emojis for display)
                    const senderName = msg.display_name || msg.username || 'Someone';
                    
                    let title;
                    if (senderRoom && senderRoom.type === 'group') {
                        // For groups: "PersonName @GroupName"
                        const groupName = senderRoom.name || 'Group';
                        title = `${senderName} @${groupName}`;
                    } else {
                        // For DMs: "@PersonName"
                        title = `@${senderName}`;
                    }
                    
                    showNotification(title, {
                        body: getMessagePreview(msg),
                        icon: msg.avatar_thumb_url || senderRoom?.avatar_thumb_url || '/logo.png',
                        badge: '/logo.png', // App badge icon (website logo)
                        tag: `room-${msg.room_id}`, // Group by room
                        data: { roomId: msg.room_id },
                        onClick: (data) => {
                            // Find and select the room
                            const targetRoom = rooms.find(r => String(r.id) === String(data.roomId));
                            if (targetRoom) {
                                handleSelectRoom(targetRoom);
                            }
                        }
                    });
                }
            } else if (msg.user_id === user.id) {
                // [NEW] Play sent sound
                const audio = new Audio(sentSound);
                audio.play().catch(e => console.log("Audio play error:", e));
            }

            setRooms(prev => {
                let updatedRooms = [...prev];
                const roomIndex = updatedRooms.findIndex(r => String(r.id) === String(msg.room_id));
                
                // [NEW] Emit delivered globally if received (e.g. in sidebar) - SKIP IF SILENT
                if (String(msg.user_id) !== String(user.id) && !isSilent) {
                    // console.log('[DEBUG-CLIENT] Emitting global message_delivered for msg:', msg.id);
                    newSocket.emit('message_delivered', { messageId: msg.id, roomId: msg.room_id });
                }

                if (roomIndex > -1) {
                     const room = { ...updatedRooms[roomIndex] };
                     // Update unread count if not active - SKIP IF SILENT
                     if (activeRoomRef.current?.id !== room.id && !isSilent) {
                         room.unread_count = (room.unread_count || 0) + 1;
                     } else if (activeRoomRef.current?.id === room.id) {
                         // [NEW] If active room, mark as read on server immediately so refresh doesn't show unread
                         fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/read`, {
                             method: 'POST',
                             headers: { Authorization: `Bearer ${token}` }
                         }).catch(console.error);
                     }
                     // Update last message preview (Always update text)
                     room.last_message_content = msg.content;
                     room.last_message_type = msg.type;
                     room.last_message_sender_id = msg.user_id;
                     room.last_message_status = msg.status || 'sent';
                     room.last_message_id = msg.id;
                     room.last_message_caption = msg.caption;
                     room.last_message_is_view_once = msg.is_view_once; // [FIX] Update view once status
                     room.last_message_viewed_by = msg.viewed_by || []; // [FIX] Reset viewed by
                     room.last_message_file_name = msg.file_name; // [FIX] Update file name for preview
                     room.last_message_sender_name = msg.display_name || msg.username; // [NEW] Update sender name for preview logic
                     room.last_message_is_deleted = msg.is_deleted_for_everyone || false; // [FIX] Reset deleted status for new message
                     room.last_message_poll_question = msg.poll?.question || null; // [NEW] Update poll question for preview
                     room.last_message_attachments_count = msg.attachments?.length || 0; // [NEW] Track attachments count for multi-image preview
                     
                     // [MODIFIED] Only update timestamp and re-sort if NOT silent
                     if (!isSilent) {
                        room.last_message_at = new Date().toISOString(); 
                     }

                     updatedRooms[roomIndex] = room;
                     
                     // Re-sort only if we updated timestamp
                     if (!isSilent) {
                        return sortRooms(updatedRooms);
                     }
                     return updatedRooms;
                }
                return updatedRooms;
            });
        });

        // [NEW] Handle message deletion update for sidebar
        newSocket.on('message_deleted', ({ messageId, is_deleted_for_everyone }) => {
            if (!is_deleted_for_everyone) return;
            
            setRooms(prev => {
                const updatedRooms = [...prev];
                // Find if any room has this message as the last message
                const roomIndex = updatedRooms.findIndex(r => String(r.last_message_id) === String(messageId));
                
                if (roomIndex > -1) {
                    const room = { ...updatedRooms[roomIndex] };
                    room.last_message_is_deleted = true;
                    updatedRooms[roomIndex] = room;
                    return updatedRooms; // No need to re-sort usually
                }
                return prev;
            });
        });

        // [NEW] Message Viewed (for View Once updates)
        newSocket.on('message_viewed', ({ id, room_id, userId }) => {
             setRooms(prev => prev.map(r => {
                 if (String(r.id) === String(room_id) && String(r.last_message_id) === String(id)) {
                     const currentViewed = r.last_message_viewed_by || [];
                     if (!currentViewed.includes(userId)) {
                         return { ...r, last_message_viewed_by: [...currentViewed, userId] };
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
                    last_message_sender_name: null,
                    last_message_status: null,
                    last_message_id: null,
                    last_message_caption: null,
                    last_message_file_name: null,
                    last_message_is_view_once: null,
                    last_message_viewed_by: null,
                    last_message_poll_question: null,
                    last_message_attachments: null,
                    last_message_attachments_count: 0,
                    last_message_is_deleted: false
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

        // [NEW] Handle real-time block/unblock (to update online status visibility in sidebar)
        newSocket.on('you_are_blocked', ({ blockerId }) => {
            setRooms(prevRooms => prevRooms.map(r => {
                if (String(r.other_user_id) === String(blockerId)) {
                    return { ...r, is_blocked_by_them: true };
                }
                return r;
            }));
        });

        newSocket.on('you_are_unblocked', ({ blockerId }) => {
            setRooms(prevRooms => prevRooms.map(r => {
                if (String(r.other_user_id) === String(blockerId)) {
                    return { ...r, is_blocked_by_them: false };
                }
                return r;
            }));
        });

        // [NEW] Poll vote - update chat list with "voted in" preview
        // ChatWindow now uses named handlers so it won't remove this listener
        newSocket.on('poll_vote', ({ roomId, pollId, poll, voterId, voterName, pollQuestion, hasVoted, lastMessage }) => {
            // Clear the message cache for this room so fresh data is fetched when chat is opened
            localStorage.removeItem(`chat_messages_${roomId}`);
            
            // Update sidebar preview
            setRooms(currentRooms => {
                const newRooms = currentRooms.map(room => {
                    if (String(room.id) === String(roomId)) {
                        // [FIX] Use authoritative lastMessage from server to correctly display "You voted" OR "Previous Message" (on unvote)
                        if (lastMessage) {
                                return {
                                    ...room,
                                    last_message_content: lastMessage.content,
                                    last_message_type: lastMessage.type,
                                    last_message_sender_id: lastMessage.sender_id,
                                    last_message_sender_name: lastMessage.sender_name,
                                    last_message_poll_question: lastMessage.poll_question,
                                    // Use the message time, or fall back to now if missing (shouldn't be missing)
                                    last_message_at: lastMessage.created_at || new Date().toISOString()
                                };
                        }

                        // Fallback logic for legacy/compatibility
                        if (hasVoted) {
                            return {
                                ...room,
                                last_message_content: pollQuestion,
                                last_message_type: 'poll_vote',
                                last_message_sender_id: voterId,
                                last_message_sender_name: voterName,
                                last_message_poll_question: pollQuestion,
                                last_message_at: new Date().toISOString()
                            };
                        } else {
                            return {
                                ...room,
                                last_message_type: 'poll',
                                last_message_poll_question: pollQuestion,
                                last_message_sender_id: poll.created_by,
                                last_message_sender_name: poll.creator_name
                            };
                        }
                    }
                    return room;
                });
                return sortRooms(newRooms);
            });
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
                    type: original.type,
                    is_view_once: original.is_view_once,
                    // Audio message fields
                    audio_duration_ms: original.audio_duration_ms,
                    // File message fields
                    file_name: original.file_name,
                    caption: original.caption,
                    // Image message fields
                    attachments: original.attachments,
                    // Location message fields
                    latitude: original.latitude,
                    longitude: original.longitude,
                    address: original.address,
                    // Poll message fields
                    poll_question: original.poll?.question
                },
            };
        });
    };

    // [NEW] Handle Room Selection with Pre-fetching & Caching
    const handleSelectRoom = async (room) => {
        if (activeRoom?.id === room.id) return; // Already valid
        
        setLoadingRoomId(room.id);
        
        // 1. Try to load from Cache first for instant open
        const cached = localStorage.getItem(`chat_messages_${room.id}`);
        let roomWithCache = { ...room };
        
        if (cached) {
            try {
                const parsedMessages = JSON.parse(cached);
                roomWithCache.initialMessages = hydrateMessages(parsedMessages);
            } catch (e) {
                console.error("Cache parse error", e);
            }
        }
        
        // Switch immediately
        setActiveRoom(roomWithCache);

        try {
            // 2. Fetch fresh messages (limit 50)
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages?limit=50`, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (res.ok) {
                const data = await res.json();
                const hydrated = hydrateMessages(data);
                
                // Update Cache
                localStorage.setItem(`chat_messages_${room.id}`, JSON.stringify(hydrated));
                
                // Update State
                setActiveRoom(prev => {
                    if (prev && String(prev.id) === String(room.id)) {
                        return { ...prev, initialMessages: hydrated };
                    }
                    return prev;
                });
            } else {
                console.error("Failed to fetch messages");
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
        {/* Notification Permission Banner */}
        <NotificationPermissionBanner />
        
        <div className={`fixed inset-0 h-[100dvh] w-full bg-gray-50 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden flex ${isResizing ? 'select-none cursor-col-resize' : ''} animate-dashboard-entry transition-colors`}>
            {/* Mobile: Sidebar hidden if activeRoom exists OR pending unlock. Desktop: Always visible */}
            <div 
                className={`
                    ${(activeRoom || pendingUnlockRoom) ? 'hidden md:flex' : 'flex'} 
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
                    isLoading={isLoadingRooms}      // [NEW] Pass initial loading state for skeletons
                    onCreateRoom={() => setShowCreateModal(true)}
                    onJoinRoom={() => setShowJoinModal(true)}
                    user={user}
                    onRefresh={fetchRooms}           // [NEW] Pass refresh handler
                    onLogout={() => setShowLogoutModal(true)}
                    onRoomLocked={(roomId) => {
                        // Close the chat if the locked room is currently active
                        if (activeRoom && String(activeRoom.id) === String(roomId)) {
                            setActiveRoom(null);
                        }
                    }}
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
            <ChatAreaLockGuard onUnlockComplete={handleSelectRoom}>
            <div className={`
                ${(activeRoom || pendingUnlockRoom) ? 'flex' : 'hidden md:flex'} 
                flex-1 flex-col h-full bg-gray-50 dark:bg-slate-950 relative z-0 min-w-0 overflow-hidden transition-colors duration-300
            `}>
                {activeRoom ? (
                    activeRoom.type === 'ai' ? (
                        <AIChatWindow
                            key={activeRoom.id}
                            socket={socket}
                            room={activeRoom}
                            user={user}
                            isLoading={loadingRoomId === activeRoom.id && !activeRoom.initialMessages}
                            onBack={() => setActiveRoom(null)}
                        />
                    ) : (
                        <ChatWindow 
                            key={activeRoom.id} // [NEW] Force re-mount for new room
                            socket={socket} 
                            room={activeRoom} // contains initialMessages now
                            user={user} 
                            isLoading={loadingRoomId === activeRoom.id && !activeRoom.initialMessages}
                            onBack={() => setActiveRoom(null)}
                            showGroupInfo={showGroupInfo}
                            setShowGroupInfo={setShowGroupInfo}
                            highlightMessageId={highlightMessageId} // [NEW]
                            onGoToMessage={handleGoToMessage} // [NEW]
                            onRefresh={fetchRooms} // [NEW] Allow refreshing room list (e.g. after block)
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
                                Welcome, {renderTextWithEmojis(user?.display_name || 'Guest', '1.1em')}
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
            </ChatAreaLockGuard>

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

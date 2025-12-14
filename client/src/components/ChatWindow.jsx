import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ProfilePanel from './ProfilePanel';
import { linkifyText } from '../utils/linkify';

const timeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
};

const PrivilegedUsersModal = ({ isOpen, onClose, title, roomId, roleFilter, token }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/members`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            const filtered = data.filter(m => roleFilter.includes(m.role));
            setUsers(filtered);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }, [isOpen, roomId, roleFilter]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl animate-modal-scale" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                {loading ? (
                    <div className="flex justify-center p-4">
                        <span className="material-symbols-outlined animate-spin text-slate-500">progress_activity</span>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {users.map(u => (
                            <div key={u.id} className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded-lg">
                                {/* Avatar */}
                                {u.avatar_thumb_url ? (
                                    <img src={u.avatar_thumb_url} alt={u.display_name} className="w-10 h-10 rounded-full object-cover" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
                                        {u.display_name[0]}
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm font-bold text-slate-200">{u.display_name}</p>
                                    <p className="text-xs text-slate-500">{u.username.startsWith('@') ? u.username : `@${u.username}`}</p>
                                </div>
                                <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                    {u.role}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default function ChatWindow({ socket, room, user, onBack, showGroupInfo, setShowGroupInfo, isLoading }) {
    const { token } = useAuth();
    const { presenceMap, fetchStatuses } = usePresence();
    const [showProfileCard, setShowProfileCard] = useState(false);
    
    const [messages, setMessages] = useState(room.initialMessages || []); 
    const [isExpired, setIsExpired] = useState(false);
    const [replyTo, setReplyTo] = useState(null); 
    const [editingMessage, setEditingMessage] = useState(null);
    const [typingUsers, setTypingUsers] = useState([]);

    const typingTimeoutsRef = useRef({});

    const headerRef = useRef(null);

    // Restriction Logic
    const [showPrivilegedModal, setShowPrivilegedModal] = useState(false);
    const [privilegedModalConfig, setPrivilegedModalConfig] = useState({ title: '', roles: [] });

    const myRole = room.role || 'member';
    const sendMode = room.send_mode || 'everyone';

    const canSend = (() => {
        if (room.type === 'direct') return true;
        if (sendMode === 'everyone') return true;
        if (sendMode === 'admins_only') return ['owner', 'admin'].includes(myRole);
        if (sendMode === 'owner_only') return myRole === 'owner';
        return true;
    })();

    const handleOpenPrivileged = () => {
        if (sendMode === 'admins_only') {
            setPrivilegedModalConfig({ title: 'Group Admins', roles: ['owner', 'admin'] });
        } else if (sendMode === 'owner_only') {
            setPrivilegedModalConfig({ title: 'Group Owner', roles: ['owner'] });
        }
        setShowPrivilegedModal(true);
    };

    const handleLeave = async () => {
        if (!confirm('Are you sure you want to leave this group?')) return;
        
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/leave`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            window.location.reload(); 
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (room.initialMessages) {
             setMessages(room.initialMessages);
        }
    }, [room.initialMessages]);

    // [NEW] Fetch members for mentions
    const [members, setMembers] = useState([]);
    useEffect(() => {
        if (room.type === 'group') {
            fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => setMembers(data))
            .catch(console.error);
        } else {
            setMembers([]);
        }
    }, [room.id, room.type, token]);

    useEffect(() => {
        if (room.type === 'direct' && room.other_user_id) {
            fetchStatuses([room.other_user_id]);
        }
    }, [room.id]);

    const otherUserStatus = room.type === 'direct' && room.other_user_id 
        ? presenceMap[room.other_user_id] 
        : null;

    useEffect(() => {
        if (!socket || !room) return;

        if (room.expires_at && new Date(room.expires_at) < new Date()) {
            setIsExpired(true);
        } else {
            setIsExpired(false);
        }

        socket.emit('join_room', room.id);

        const handleNewMessage = (msg) => {
            console.log('Received new_message:', msg, 'Current room:', room.id);
            if (String(msg.room_id) === String(room.id)) {
                // [NEW] Emit delivered
                if (msg.user_id !== user.id) {
                    socket.emit('message_delivered', { messageId: msg.id, roomId: room.id });
                }

                setTypingUsers(prev => prev.filter(u => u.userId !== msg.user_id));
                if (typingTimeoutsRef.current[msg.user_id]) {
                    clearTimeout(typingTimeoutsRef.current[msg.user_id]);
                    delete typingTimeoutsRef.current[msg.user_id];
                }

                setMessages(prev => {
                    if (prev.some(m => m.id === msg.id)) {
                        return prev;
                    }

                    let processedMsg = { ...msg };
                    if (!processedMsg.replyTo && processedMsg.reply_to_message_id) {
                        const original = prev.find(m => m.id === processedMsg.reply_to_message_id);
                        if (original) {
                            const raw = original.content || "";
                            const normalized = raw.replace(/\s+/g, " ").trim();
                            const maxLen = 120;
                            const snippet = normalized.length > maxLen ? normalized.slice(0, maxLen) + "…" : normalized;
                            processedMsg.replyTo = {
                                id: original.id,
                                sender: original.display_name || original.username,
                                text: snippet,
                                type: original.type,
                                audio_duration_ms: original.audio_duration_ms
                            };
                        }
                    }

                    let optimisticIndex = -1;

                    if (processedMsg.tempId) {
                         optimisticIndex = prev.findIndex(m => m.id === processedMsg.tempId);
                    } else {
                        const reversedIndex = [...prev].reverse().findIndex(m => 
                            m.status === 'sending' && 
                            m.content === processedMsg.content && 
                            m.user_id === processedMsg.user_id
                        );
                        if (reversedIndex !== -1) {
                            optimisticIndex = prev.length - 1 - reversedIndex;
                        }
                    }
                    
                    if (optimisticIndex !== -1) {
                        const newMsgs = [...prev];
                        const preservedMsg = { 
                            ...processedMsg, 
                            replyTo: processedMsg.replyTo || prev[optimisticIndex].replyTo 
                        };
                        newMsgs[optimisticIndex] = preservedMsg;
                        return newMsgs;
                    }
                    return [...prev, processedMsg];
                });
            } else {
                console.log('Message not for this room');
            }
        };

        const handleStatusUpdate = ({ messageIds, status, roomId }) => {
            if (roomId === room.id) {
                setMessages(prev => prev.map(msg => 
                    messageIds.includes(msg.id) ? { ...msg, status } : msg
                ));
            }
        };

        const handleMessageDeleted = ({ messageId, is_deleted_for_everyone, content }) => {
            setMessages(prev => prev.map(msg => 
                String(msg.id) === String(messageId) ? { ...msg, is_deleted_for_everyone: true, content: "" } : msg
            ));
        };

        const handleMessageEdited = (updatedMsg) => {
             if (String(updatedMsg.room_id) === String(room.id)) {
                 setMessages(prev => prev.map(msg => {
                     if (msg.id === updatedMsg.id) {
                         return { 
                             ...msg, 
                             content: updatedMsg.content,
                             edited_at: updatedMsg.edited_at,
                             edit_version: updatedMsg.edit_version
                         };
                     }
                     return msg;
                 }));
             }
        };

        const handleTypingStart = ({ room_id, user_id, user_name }) => {
             if (String(room_id) !== String(room.id)) return;
             
             if (typingTimeoutsRef.current[user_id]) {
                 clearTimeout(typingTimeoutsRef.current[user_id]);
             }

             setTypingUsers(prev => {
                 if (prev.some(u => u.userId === user_id)) return prev;
                 return [...prev, { userId: user_id, name: user_name }];
             });

             typingTimeoutsRef.current[user_id] = setTimeout(() => {
                 setTypingUsers(prev => prev.filter(u => u.userId !== user_id));
                 delete typingTimeoutsRef.current[user_id];
             }, 4000);
        };

        const handleTypingStop = ({ room_id, user_id }) => {
             if (String(room_id) !== String(room.id)) return;
             
             if (typingTimeoutsRef.current[user_id]) {
                 clearTimeout(typingTimeoutsRef.current[user_id]);
                 delete typingTimeoutsRef.current[user_id];
             }
             setTypingUsers(prev => prev.filter(u => u.userId !== user_id));
        };

        socket.on('new_message', handleNewMessage);
        socket.on('messages_status_update', handleStatusUpdate);
        socket.on('message_deleted', handleMessageDeleted);
        socket.on('message_edited', handleMessageEdited);
        socket.on('typing:start', handleTypingStart);
        socket.on('typing:stop', handleTypingStop);


        socket.on('chat:cleared', ({ roomId }) => {
            if (String(roomId) === String(room.id)) {
                setMessages([]); 
            }
        });

        // [NEW] Update messages when a user changes their display name
        const handleProfileUpdate = ({ userId, display_name }) => {
            setMessages(prev => prev.map(msg => {
                if (String(msg.user_id) === String(userId)) {
                    return { ...msg, display_name };
                }
                return msg;
            }));

            setTypingUsers(prev => prev.map(u => {
                if (String(u.userId) === String(userId)) {
                    return { ...u, name: display_name };
                }
                return u;
            }));
        };

        socket.on('user:profile:updated', handleProfileUpdate);

        return () => {
            socket.off('new_message', handleNewMessage);
            socket.off('messages_status_update', handleStatusUpdate);
            socket.off('message_deleted', handleMessageDeleted);
            socket.off('message_edited', handleMessageEdited);
            socket.off('typing:start', handleTypingStart);
            socket.off('typing:stop', handleTypingStop);
            socket.off('chat:cleared'); // [FIX] forgot to cleanup this one? It was implicit but good to be explicit
            socket.off('user:profile:updated', handleProfileUpdate);
            
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
        };
    }, [socket, room, token]);

    const handleLocalDelete = (messageId) => {
        setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const handleSend = async (content, replyToMsg) => {
        if (!isExpired) {
            const tempId = `temp-${Date.now()}`;
            const tempMsg = {
                id: tempId,
                room_id: room.id,
                user_id: user.id,
                content,
                replyTo: replyToMsg || null,
                created_at: new Date().toISOString(),
                username: user.username,
                display_name: user ? user.display_name : 'Me',
                status: 'sending'
            };
            setMessages(prev => [...prev, tempMsg]);
            setReplyTo(null);
            
            socket.emit('send_message', { 
                roomId: room.id, 
                content,
                replyToMessageId: replyToMsg ? replyToMsg.id : null,
                tempId 
            });
        }
    };



    const uploadAudioWithProgress = async (formData, tempId) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${import.meta.env.VITE_API_URL}/api/messages/audio`);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = event.loaded / event.total;
                    setMessages(prev => prev.map(m => 
                        m.id === tempId ? { ...m, uploadProgress: percent } : m
                    ));
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error('Upload failed'));
                }
            };

            xhr.onerror = () => reject(new Error('Network error'));
            
            xhr.send(formData);
        });
    };

    const handleSendAudio = async (blob, durationMs, waveform, replyToMsg) => {
        const tempId = `temp-${Date.now()}`;
        const tempMsg = {
            id: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'audio',
            content: null,
            audio_url: URL.createObjectURL(blob),
            audio_duration_ms: durationMs,
            audio_waveform: waveform,
            replyTo: replyToMsg || null,
            created_at: new Date().toISOString(),
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            uploadStatus: 'uploading',
            uploadProgress: 0,
            localBlob: blob 
        };
        setMessages(prev => [...prev, tempMsg]);
        setReplyTo(null);

        const formData = new FormData();
        formData.append('audio', blob);
        formData.append('roomId', room.id);
        formData.append('durationMs', durationMs);
        formData.append('waveform', JSON.stringify(waveform));
        if (replyToMsg) formData.append('replyToMessageId', replyToMsg.id);
        formData.append('tempId', tempId);

        try {
            await uploadAudioWithProgress(formData, tempId);
        } catch (err) {
            console.error(err);
            setMessages(prev => prev.map(m => 
                m.id === tempId ? { ...m, uploadStatus: 'failed', status: 'error' } : m
            ));
        }
    };

    const handleRetryAudio = async (msg) => {
        if (!msg.localBlob) return;
        
        setMessages(prev => prev.map(m => 
            m.id === msg.id ? { ...m, uploadStatus: 'uploading', uploadProgress: 0, status: 'sending' } : m
        ));

        const formData = new FormData();
        formData.append('audio', msg.localBlob);
        formData.append('roomId', room.id);
        formData.append('durationMs', msg.audio_duration_ms);
        formData.append('waveform', JSON.stringify(msg.audio_waveform));
        if (msg.replyTo) formData.append('replyToMessageId', msg.replyTo.id);
        formData.append('tempId', msg.id);

        try {
            await uploadAudioWithProgress(formData, msg.id);
        } catch (err) {
            console.error(err);
            setMessages(prev => prev.map(m => 
                m.id === msg.id ? { ...m, uploadStatus: 'failed', status: 'error' } : m
            ));
        }
    };

    const handleEditMessage = async (msgId, newContent) => {
        setMessages(prev => prev.map(m => 
            m.id === msgId 
            ? { ...m, content: newContent, edited_at: new Date().toISOString(), edit_version: (m.edit_version || 0) + 1 } 
            : m
        ));
        setEditingMessage(null);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${msgId}/edit`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ new_content: newContent })
            });
            if (!res.ok) {
                console.error("Edit failed");
            }
        } catch (err) {
            console.error(err);
        }
    };

    const getTypingText = () => {
        if (typingUsers.length === 0) return null;
        if (room.type === 'direct') return "is typing...";
        
        if (typingUsers.length === 1) return `${typingUsers[0].name} is typing...`;
        if (typingUsers.length === 2) return `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`;
        return `${typingUsers[0].name}, ${typingUsers[1].name}, and ${typingUsers.length - 2} others are typing...`;
    };

    const handleSendGif = async (gif, caption) => {
        const tempId = `temp-${Date.now()}`;
        const finalGifUrl = gif.mp4_url || gif.gif_url;
        const finalPreviewUrl = gif.preview_url || gif.gifpreview;
        
        const tempMsg = {
            id: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'gif',
            content: caption || null,
            gif_url: finalGifUrl,
            preview_url: finalPreviewUrl,
            width: gif.width,
            height: gif.height,
            replyTo: replyTo || null, // Include replyTo context
            created_at: new Date().toISOString(),
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending'
        };
        setMessages(prev => [...prev, tempMsg]);
        
        // Capture replyTo locally before clearing state
        const replyToId = replyTo ? replyTo.id : null;
        setReplyTo(null); // Clear reply state

        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/messages`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({
                    room_id: room.id,
                    content: caption || null,
                    type: 'gif',
                    gif_url: finalGifUrl,
                    preview_url: finalPreviewUrl,
                    width: gif.width,
                    height: gif.height,
                    replyToMessageId: replyToId, // Send to backend
                    tempId
                })
            });
        } catch (err) {
            console.error(err);
            setMessages(prev => prev.map(m => 
                m.id === tempId ? { ...m, status: 'error' } : m
            ));
        }
    };



    // Search State
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchMatches, setSearchMatches] = useState([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const searchInputRef = useRef(null);

    // Close search when room changes
    useEffect(() => {
        setShowSearch(false);
        setSearchTerm('');
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
    }, [room.id]);

    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    const handleSearch = (term) => {
        setSearchTerm(term);
        if (!term.trim()) {
            setSearchMatches([]);
            setCurrentMatchIndex(-1);
            return;
        }

        const lowerTerm = term.toLowerCase();
        // Find all message IDs that match. Filter system messages? Maybe include them.
        const matches = messages
            .filter(m => m.content && typeof m.content === 'string' && m.content.toLowerCase().includes(lowerTerm))
            .map(m => m.id);
        
        setSearchMatches(matches);
        if (matches.length > 0) {
            setCurrentMatchIndex(matches.length - 1); // Start at most recent? Or first? usually "Down" goes to next. Let's start at the bottom (newest) or top? Standard is "Find Next".
            // Let's scroll to the *last* match (most recent) typically for chat?
            // Actually, "Find" usually jumps to the first match in viewport or first match overall.
            // Let's default to the *most recent* match (bottom-most) because that's where user usually is.
            scrollToMatch(matches[matches.length - 1]);
        } else {
            setCurrentMatchIndex(-1);
        }
    };

    const scrollToMatch = (msgId) => {
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('reply-highlight'); // Re-use the highlight class
            setTimeout(() => el.classList.remove('reply-highlight'), 2000);
        }
    };

    const nextMatch = () => {
        if (searchMatches.length === 0) return;
        let newIndex = currentMatchIndex - 1; // Go "Up" (older)
        if (newIndex < 0) newIndex = searchMatches.length - 1; // Wrap to bottom
        setCurrentMatchIndex(newIndex);
        scrollToMatch(searchMatches[newIndex]);
    };

    const prevMatch = () => {
        if (searchMatches.length === 0) return;
        let newIndex = currentMatchIndex + 1; // Go "Down" (newer)
        if (newIndex >= searchMatches.length) newIndex = 0; // Wrap to top
        setCurrentMatchIndex(newIndex);
        scrollToMatch(searchMatches[newIndex]);
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950 relative overflow-hidden transition-colors">
            {/* ... (Modal and Background remain same, but easier to just wrap MessageList) */}
            <PrivilegedUsersModal 
                isOpen={showPrivilegedModal} 
                onClose={() => setShowPrivilegedModal(false)}
                title={privilegedModalConfig.title}
                roleFilter={privilegedModalConfig.roles}
                roomId={room.id}
                token={token}
            />
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-200/40 via-gray-50 to-gray-50 dark:from-violet-900/20 dark:via-slate-950 dark:to-slate-950 pointer-events-none transition-colors" />

            {/* Header */}
            <div className="border-b border-slate-200/50 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex flex-col shadow-sm z-10 transition-colors">
                {/* Main Header Row */}
                <div className="p-4 flex items-center gap-4">
                    <button 
                        onClick={onBack}
                        className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>

                    <div 
                        ref={headerRef}
                        className="flex-1 min-w-0 cursor-pointer flex items-center gap-3" 
                        onClick={() => {
                            if (room.type === 'direct') setShowProfileCard(!showProfileCard);
                            else setShowGroupInfo(true);
                        }}
                    >
                        {/* Header Avatar */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shrink-0 overflow-hidden ${!room.avatar_url && !room.avatar_thumb_url ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}>
                            {(room.avatar_url || room.avatar_thumb_url) ? (
                                <img src={room.avatar_url || room.avatar_thumb_url} alt={room.name} className="w-full h-full object-cover" />
                            ) : (
                                room.type === 'direct' 
                                    ? room.display_name?.[0]?.toUpperCase() || room.name?.[0]?.toUpperCase()
                                    : '#'
                            )}
                        </div>

                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 truncate transition-colors duration-300">
                                {room.type === 'group' && (
                                    <span className="material-symbols-outlined text-violet-500 dark:text-violet-400 shrink-0">tag</span>
                                )}
                                <span className="truncate">{linkifyText(room.name)}</span>
                                {room.type === 'group' && (
                                    <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-slate-500 dark:text-slate-400 font-mono border border-slate-200 dark:border-slate-700 ml-2 shrink-0 transition-colors duration-300">
                                        {room.code}
                                    </span>
                                )}
                            </h2>
                            {room.type === 'direct' && room.username && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate transition-colors duration-300">
                                    {room.username.startsWith('@') ? room.username : `@${room.username}`}
                                </p>
                            )}
                            
                            {room.type === 'direct' && otherUserStatus && (
                                <div className="text-xs font-medium mt-0.5">
                                    {otherUserStatus.online ? (
                                        <span className="text-green-500 dark:text-green-400">Online now</span>
                                    ) : otherUserStatus.last_seen ? (
                                        <span className="text-slate-400 dark:text-slate-500">Last seen {timeAgo(otherUserStatus.last_seen)}</span>
                                    ) : (
                                        <span className="text-slate-400 dark:text-slate-600">Offline</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {room.expires_at && (
                            <p className={`text-xs mt-0.5 flex items-center gap-1 ${isExpired ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                <span className="material-symbols-outlined text-[14px]">
                                    {isExpired ? 'timer_off' : 'timer'}
                                </span>
                                {isExpired ? 'Expired' : `Expires: ${new Date(room.expires_at).toLocaleString()}`}
                            </p>
                        )}
                    </div>
                        
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setShowSearch(!showSearch)}
                            className={`p-2 transition-all rounded-full ${showSearch ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            title="Search in chat"
                        >
                            <span className="material-symbols-outlined">search</span>
                        </button>
                        {room.type === 'group' && (
                            <button 
                                onClick={() => setShowGroupInfo(true)}
                                className="p-2 text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-all rounded-full"
                            >
                                <span className="material-symbols-outlined">info</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Search Bar Row */}
                {showSearch && (
                    <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                         {/* Design match: Dark bg (in dark mode), Blue border, Rounded */}
                         <div className="flex items-center bg-white dark:bg-[#0f1117] border border-sky-500 dark:border-sky-500 rounded-lg px-3 py-1.5 shadow-sm transition-all">
                             <span className="material-symbols-outlined text-slate-400 text-[20px] select-none">search</span>
                             <div className="flex-1 relative mx-2">
                                 <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    placeholder="Search"
                                    className="w-full bg-transparent border-none p-0 text-sm focus:ring-0 focus:outline-none shadow-none text-slate-700 dark:text-slate-200 placeholder-slate-400"
                                    style={{ boxShadow: 'none' }} // Force no shadow/outline
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (e.shiftKey) prevMatch();
                                            else nextMatch();
                                        }
                                        if (e.key === 'Escape') {
                                            setShowSearch(false);
                                            setSearchTerm('');
                                            setSearchMatches([]);
                                        }
                                    }}
                                 />
                             </div>
                             
                             <div className="flex items-center gap-1">
                                 {searchMatches.length > 0 && (
                                     <span className="text-xs text-slate-400 font-mono mr-2 select-none">
                                         {currentMatchIndex + 1}/{searchMatches.length}
                                     </span>
                                 )}
                                 
                                 {/* Up Arrow */}
                                 <button 
                                    onClick={nextMatch}
                                    disabled={searchMatches.length === 0}
                                    className="p-1 text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 disabled:opacity-30 transition-colors flex items-center justify-center"
                                    title="Previous match (Shift+Enter)" 
                                 >
                                     <span className="material-symbols-outlined text-[20px]">keyboard_arrow_up</span>
                                 </button>

                                 {/* Down Arrow */}
                                 <button 
                                    onClick={prevMatch}
                                    disabled={searchMatches.length === 0}
                                    className="p-1 text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 disabled:opacity-30 transition-colors flex items-center justify-center"
                                    title="Next match (Enter)"
                                 >
                                     <span className="material-symbols-outlined text-[20px]">keyboard_arrow_down</span>
                                 </button>
                                 
                                 {/* Close (X in circle) */}
                                 <button 
                                    onClick={() => {
                                        setShowSearch(false);
                                        setSearchTerm('');
                                        setSearchMatches([]);
                                    }}
                                    className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 ml-1 transition-colors flex items-center justify-center"
                                    title="Close"
                                 >
                                     <span className="material-symbols-outlined text-[20px]">cancel</span>
                                 </button>
                             </div>
                         </div>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 z-10">
                     <span className="material-symbols-outlined text-4xl animate-spin text-violet-500">progress_activity</span>
                     <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse">Loading your messages...</p>
                </div>
            ) : (
                <MessageList 
                    messages={messages} 
                    setMessages={setMessages} 
                    currentUser={user} 
                    roomId={room.id} 
                    socket={socket} 
                    onReply={setReplyTo} 
                    onDelete={handleLocalDelete}
                    onRetry={handleRetryAudio} 
                    onEdit={setEditingMessage}
                    searchTerm={searchTerm} // [NEW] Pass search term
                />
            )}
            

            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
                <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 font-medium italic animate-pulse flex items-center gap-1 z-10 bg-white/50 dark:bg-slate-900/30 backdrop-blur-sm transition-colors duration-300">
                    <span className="material-symbols-outlined text-[14px] animate-bounce">more_horiz</span>
                    {getTypingText()}
                </div>
            )}

            {canSend ? (
                <MessageInput 
                    onSend={(content) => handleSend(content, replyTo)} 
                    onSendAudio={(blob, duration, waveform) => handleSendAudio(blob, duration, waveform, replyTo)}
                    onSendGif={handleSendGif} 
                    disabled={isExpired} 
                    replyTo={replyTo}          
                    setReplyTo={setReplyTo}
                    
                    editingMessage={editingMessage}
                    onCancelEdit={() => setEditingMessage(null)}
                    onEditMessage={handleEditMessage}
                    onTypingStart={() => socket?.emit('typing:start', { roomId: room.id })}
                    onTypingStop={() => socket?.emit('typing:stop', { roomId: room.id })}
                    members={members}
                    currentUser={user}
                />
            ) : (
                <div className="p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-t border-slate-200/50 dark:border-slate-800/50 z-10 flex justify-center items-center h-[88px] transition-colors duration-300">
                    <div className="bg-slate-100/80 dark:bg-slate-800/80 px-6 py-3 rounded-full flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-lg">
                        <span className="material-symbols-outlined text-slate-400 text-sm">lock</span>
                        <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                            Only{' '}
                            <button 
                                onClick={handleOpenPrivileged}
                                className="font-bold text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 underline decoration-violet-500/30 underline-offset-4 hover:decoration-violet-500 transition-all"
                            >
                                {sendMode === 'admins_only' ? 'admins' : 'owner'}
                            </button>
                            {' '}can send messages
                        </span>
                    </div>
                </div>
            )}

            {showProfileCard && room.type === 'direct' && (
                <ProfilePanel 
                    userId={room.other_user_id}
                    roomId={room.id}
                    onClose={() => setShowProfileCard(false)}
                    onActionSuccess={(action) => {
                        if (action === 'delete') {
                            onBack(); // Go back to empty state
                        }
                    }}
                />
            )}
        </div>
    );
}

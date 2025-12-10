import { useState, useEffect, useRef } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import ProfileCard from './ProfileCard'; // Will create next
// [MODIFIED] Added timeAgo helper (already present, just ensuring it stays)

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

export default function ChatWindow({ socket, room, user, onBack, showGroupInfo, setShowGroupInfo }) {
    const { token } = useAuth();
    const { presenceMap, fetchStatuses } = usePresence();
    const [showProfileCard, setShowProfileCard] = useState(false);
    // [REMOVED] headerAvatarRef no longer needed
    
    // [MODIFIED] Initialize with props instead of empty array
    const [messages, setMessages] = useState(room.initialMessages || []); 
    const [isExpired, setIsExpired] = useState(false);
    const [replyTo, setReplyTo] = useState(null); 
    const [editingMessage, setEditingMessage] = useState(null);
    const [typingUsers, setTypingUsers] = useState([]);
    const typingTimeoutsRef = useRef({});

    const headerRef = useRef(null); // [NEW]

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

    // [NEW] Update messages when room or initialMessages changes (forcing reset if room changes, though usually key change handles this)
    useEffect(() => {
        if (room.initialMessages) {
             setMessages(room.initialMessages);
        }
    }, [room.initialMessages]);

    // Fetch status if direct chat
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

        // Check expiry
        if (room.expires_at && new Date(room.expires_at) < new Date()) {
            setIsExpired(true);
        } else {
            setIsExpired(false);
        }

        // Join room
        socket.emit('join_room', room.id);

        // Listen for messages
        const handleNewMessage = (msg) => {
            console.log('Received new_message:', msg, 'Current room:', room.id);
            // [MODIFIED] Robust comparison for room ID (string vs number)
            if (String(msg.room_id) === String(room.id)) {
                // Clear typing indicator for this user if they sent a message
                setTypingUsers(prev => prev.filter(u => u.userId !== msg.user_id));
                if (typingTimeoutsRef.current[msg.user_id]) {
                    clearTimeout(typingTimeoutsRef.current[msg.user_id]);
                    delete typingTimeoutsRef.current[msg.user_id];
                }

                setMessages(prev => {
                    // [MODIFIED] Check for strict duplicates by ID first
                    // This handles the case where the sender receives their own message back from the server
                    if (prev.some(m => m.id === msg.id)) {
                        return prev;
                    }

                    // Hydrate msg if needed (for other users who get the message with just ID)
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

                    // Check for optimistic message to replace using tempId if available
                    let optimisticIndex = -1;

                    if (processedMsg.tempId) {
                         optimisticIndex = prev.findIndex(m => m.id === processedMsg.tempId);
                    } else {
                        // Fallback: match by content and user_id (reversed to find latest)
                        // [MODIFIED] Added timestamp check to be safer? No, rely on content/user for now as before.
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
                        // Preserve replyTo from the optimistic message if the server message doesn't have it
                        const preservedMsg = { 
                            ...processedMsg, 
                            replyTo: processedMsg.replyTo || prev[optimisticIndex].replyTo 
                        };
                        newMsgs[optimisticIndex] = preservedMsg; // Replace with real message
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
                         // Update content and edit info, keep other fields like replyTo, user info
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
             
             // Clear existing timeout
             if (typingTimeoutsRef.current[user_id]) {
                 clearTimeout(typingTimeoutsRef.current[user_id]);
             }

             // Add user if not present
             setTypingUsers(prev => {
                 if (prev.some(u => u.userId === user_id)) return prev;
                 return [...prev, { userId: user_id, name: user_name }];
             });

             // Set new timeout (auto remove after 4s)
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

        return () => {
            socket.off('new_message', handleNewMessage);
            socket.off('messages_status_update', handleStatusUpdate);
            socket.off('message_deleted', handleMessageDeleted);
            socket.off('message_edited', handleMessageEdited);
            socket.off('typing:start', handleTypingStart);
            socket.off('typing:stop', handleTypingStop);
            
            // Clear all timeouts
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
        };
    }, [socket, room, token]);

    const handleLocalDelete = (messageId) => {
        setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const handleSend = (content, replyToMsg) => { // [MODIFY] accept replyToMsg
        if (socket && !isExpired) {
            // Optimistic Update
            const tempId = `temp-${Date.now()}`;
            const tempMsg = {
                id: tempId,
                room_id: room.id,
                user_id: user.id,
                content,
                replyTo: replyToMsg || null, // [NEW] include replyTo
                created_at: new Date().toISOString(),
                username: user.username,
                display_name: user ? user.display_name : 'Me',
                status: 'sending'
            };
            setMessages(prev => [...prev, tempMsg]);
            
            socket.emit('send_message', { 
                roomId: room.id, 
                content,
                replyToMessageId: replyToMsg ? replyToMsg.id : null,
                tempId 
            });
            setReplyTo(null); // [NEW] Clear reply after sending
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

    const handleSendAudio = async (blob, durationMs, waveform, replyToMsg) => { // [MODIFIED] Helper function
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
            localBlob: blob // Save for retry
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
            // Socket event will handle success replacement
        } catch (err) {
            console.error(err);
            setMessages(prev => prev.map(m => 
                m.id === tempId ? { ...m, uploadStatus: 'failed', status: 'error' } : m
            ));
        }
    };

    const handleRetryAudio = async (msg) => {
        if (!msg.localBlob) return; // Should have it
        
        // Reset to uploading state
        setMessages(prev => prev.map(m => 
            m.id === msg.id ? { ...m, uploadStatus: 'uploading', uploadProgress: 0, status: 'sending' } : m
        ));

        const formData = new FormData();
        formData.append('audio', msg.localBlob);
        formData.append('roomId', room.id);
        formData.append('durationMs', msg.audio_duration_ms);
        formData.append('waveform', JSON.stringify(msg.audio_waveform));
        if (msg.replyTo) formData.append('replyToMessageId', msg.replyTo.id);
        formData.append('tempId', msg.id); // Reuse tempId

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
        // Optimistic update
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
        if (room.type === 'direct') return "is typing..."; // Direct chat usually just one other person
        
        if (typingUsers.length === 1) return `${typingUsers[0].name} is typing...`;
        if (typingUsers.length === 2) return `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`;
        return `${typingUsers[0].name}, ${typingUsers[1].name}, and ${typingUsers.length - 2} others are typing...`;
    };

    const handleSendGif = async (gif, caption) => { // Removed default 'GIF'
        const tempId = `temp-${Date.now()}`;
        // gif object structure from tenor.js: { id, title, preview_url, gif_url, mp4_url, url, type, width, height }
        const finalGifUrl = gif.mp4_url || gif.gif_url;
        const finalPreviewUrl = gif.preview_url || gif.gifpreview;
        
        const tempMsg = {
            id: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'gif', // Database type is 'gif', but content might be mp4 url
            content: caption || null, // Prompt req: content || null
            gif_url: finalGifUrl,
            preview_url: finalPreviewUrl,
            width: gif.width,
            height: gif.height,
            created_at: new Date().toISOString(),
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending'
        };
        setMessages(prev => [...prev, tempMsg]);

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

    return (
        <div className="flex flex-col h-full bg-slate-950 relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-900/20 via-slate-950 to-slate-950 pointer-events-none" />

            {/* Header */}
            <div className="p-4 border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-md flex items-center gap-4 shadow-sm z-10">
                <button 
                    onClick={onBack}
                    className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>

                <div 
                    ref={headerRef} // [NEW] Attach ref
                    className="flex-1 min-w-0 cursor-pointer flex items-center gap-3" 
                    onClick={() => {
                        if (room.type === 'direct') setShowProfileCard(!showProfileCard);
                        else setShowGroupInfo(true);
                    }}
                >
                    {/* [NEW] Header Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shrink-0 overflow-hidden ${!room.avatar_url && !room.avatar_thumb_url ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-800'}`}>
                        {room.type === 'direct' && (room.avatar_url || room.avatar_thumb_url) ? (
                            <img src={room.avatar_url || room.avatar_thumb_url} alt={room.name} className="w-full h-full object-cover" />
                        ) : (
                            room.type === 'direct' 
                                ? room.display_name?.[0]?.toUpperCase() || room.name?.[0]?.toUpperCase()
                                : '#'
                        )}
                    </div>

                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 truncate">
                            {room.type === 'group' && (
                                <span className="material-symbols-outlined text-violet-400 shrink-0">tag</span>
                            )}
                            <span className="truncate">{room.name}</span>
                            {room.type === 'group' && (
                                <span className="text-xs bg-slate-800 px-2 py-1 rounded-md text-slate-400 font-mono border border-slate-700 ml-2 shrink-0">
                                    {room.code}
                                </span>
                            )}
                        </h2>
                        {room.type === 'direct' && room.username && (
                            <p className="text-xs text-slate-400 font-medium truncate">
                                {room.username.startsWith('@') ? room.username : `@${room.username}`}
                            </p>
                        )}
                        
                        {room.type === 'direct' && otherUserStatus && (
                            <div className="text-xs font-medium mt-0.5">
                                {otherUserStatus.online ? (
                                    <span className="text-green-400">Online now</span>
                                ) : otherUserStatus.last_seen ? (
                                    <span className="text-slate-500">Last seen {timeAgo(otherUserStatus.last_seen)}</span>
                                ) : (
                                    <span className="text-slate-600">Offline</span>
                                )}
                            </div>
                        )}
                    </div>

                    {room.expires_at && (
                        <p className={`text-xs mt-0.5 flex items-center gap-1 ${isExpired ? 'text-red-400' : 'text-emerald-400'}`}>
                            <span className="material-symbols-outlined text-[14px]">
                                {isExpired ? 'timer_off' : 'timer'}
                            </span>
                            {isExpired ? 'Expired' : `Expires: ${new Date(room.expires_at).toLocaleString()}`}
                        </p>
                    )}
                </div>

                {room.type === 'group' && (
                    <button 
                        onClick={() => setShowGroupInfo(true)}
                        className="p-2 text-slate-400 hover:text-white transition-all"
                    >
                        <span className="material-symbols-outlined">info</span>
                    </button>
                )}
            </div>

            <MessageList 
                messages={messages} 
                setMessages={setMessages} 
                currentUser={user} 
                roomId={room.id} 
                socket={socket} 
                onReply={setReplyTo} 
                onDelete={handleLocalDelete}
                onRetry={handleRetryAudio} 
                onEdit={setEditingMessage} // [NEW]
            />
            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
                <div className="px-4 py-2 text-xs text-slate-400 font-medium italic animate-pulse flex items-center gap-1 z-10 bg-slate-900/30 backdrop-blur-sm">
                    <span className="material-symbols-outlined text-[14px] animate-bounce">more_horiz</span>
                    {getTypingText()}
                </div>
            )}

            <MessageInput 
                onSend={(content) => handleSend(content, replyTo)} 
                onSendAudio={(blob, duration, waveform) => handleSendAudio(blob, duration, waveform, replyTo)}
                onSendGif={handleSendGif} // [NEW]
                disabled={isExpired} 
                replyTo={replyTo}          
                setReplyTo={setReplyTo}
                
                // [NEW] Props for editing and typing
                editingMessage={editingMessage}
                onCancelEdit={() => setEditingMessage(null)}
                onEditMessage={handleEditMessage}
                onTypingStart={() => socket?.emit('typing:start', { roomId: room.id })}
                onTypingStop={() => socket?.emit('typing:stop', { roomId: room.id })}
            />

            {showProfileCard && room.type === 'direct' && (
                <ProfileCard 
                    targetUser={{
                        id: room.other_user_id,
                        display_name: room.name,
                        username: room.username,
                        avatar_url: room.avatar_url,
                        avatar_thumb_url: room.avatar_thumb_url
                    }}
                    onClose={() => setShowProfileCard(false)}
                    anchorRef={headerRef} // [NEW]
                />
            )}
        </div>
    );
}

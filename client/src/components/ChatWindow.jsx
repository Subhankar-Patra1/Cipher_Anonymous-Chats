import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ProfilePanel from './ProfilePanel';
import ImagePreviewModal from './ImagePreviewModal';
import FilePreviewModal from './FilePreviewModal';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import LocationPicker from './LocationPicker';
import CreatePollModal from './CreatePollModal';
import PinDurationModal from './PinDurationModal';
import { linkifyText } from '../utils/linkify';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

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

export default function ChatWindow({ socket, room, user, onBack, showGroupInfo, setShowGroupInfo, isLoading, highlightMessageId, onGoToMessage }) {
    const { token } = useAuth();
    const { presenceMap, fetchStatuses } = usePresence();
    const [showProfileCard, setShowProfileCard] = useState(false);
    
    const [messages, setMessages] = useState(room.initialMessages || []); 
    const [isExpired, setIsExpired] = useState(false);
    const [replyTo, setReplyTo] = useState(null); 
    const [editingMessage, setEditingMessage] = useState(null);
    const [typingUsers, setTypingUsers] = useState([]);
    const [selectedImages, setSelectedImages] = useState(null);
    const [selectedFiles, setSelectedFiles] = useState(null);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [showCreatePoll, setShowCreatePoll] = useState(false);
    const [pinToConfirm, setPinToConfirm] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const hydrateMessages = (newMsgs, existingMsgs = []) => {
        const all = [...newMsgs, ...existingMsgs];
        const byId = new Map(all.map(m => [String(m.id), m]));
        
        return newMsgs.map(m => {
             if (!m.reply_to_message_id) return m;
             const original = byId.get(String(m.reply_to_message_id));
             if (!original) return m;

             const raw = original.content || "";
             const normalized = raw.replace(/\s+/g, " ").trim();
             const maxLen = 120;
             const snippet = normalized.length > maxLen ? normalized.slice(0, maxLen) + "…" : normalized;

             return {
                 ...m,
                 replyTo: {
                     id: original.id,
                     sender: original.display_name || original.username,
                     text: snippet,
                     type: original.type,
                     is_view_once: original.is_view_once,
                     audio_duration_ms: original.audio_duration_ms,
                     file_name: original.file_name,
                     caption: original.caption,
                     poll_question: original.poll?.question,
                     attachments: original.attachments // [NEW] Pass attachments
                 }
             };
        });
    };

    const handleLoadOlderMessages = async () => {
        if (loadingMore || !hasMore || messages.length === 0) return;

        setLoadingMore(true);
        const oldestMsg = messages[0];
        const oldestId = oldestMsg.created_at; 

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages?limit=50&before=${oldestId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const newMessages = await res.json();
                
                // Hydrate
                const hydratedMessages = hydrateMessages(newMessages, messages);
                 
                if (hydratedMessages.length < 50) {
                    setHasMore(false);
                }

                if (hydratedMessages.length > 0) {
                    setMessages(prev => [...hydratedMessages, ...prev]);
                }
            }
        } catch (err) {
            console.error("Failed to load older messages", err);
        } finally {
            setLoadingMore(false);
        }
    };

    // [NEW] Persist Cache (Latest 50)
    useEffect(() => {
        if (messages.length > 0) {
            const latest50 = messages.slice(-50);
            localStorage.setItem(`chat_messages_${room.id}`, JSON.stringify(latest50));
        }
    }, [messages, room.id]);

    // Reset Pagination on Room Change
    useEffect(() => {
        setHasMore(true);
        setLoadingMore(false);
    }, [room.id]);

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

    // [NEW] Scroll to validated message
    useEffect(() => {
        if (highlightMessageId) {
            // Small timeout to ensure DOM is ready if switching rooms
            setTimeout(() => {
                scrollToMatch(highlightMessageId);
            }, 100);
        }
    }, [highlightMessageId]);

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
                    if (prev.some(m => String(m.id) === String(msg.id))) {
                        return prev;
                    }

                    let processedMsg = { ...msg };
                    if (!processedMsg.replyTo && processedMsg.reply_to_message_id) {
                        const original = prev.find(m => String(m.id) === String(processedMsg.reply_to_message_id));
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
                                audio_duration_ms: original.audio_duration_ms,
                                is_view_once: original.is_view_once,
                                file_name: original.file_name,
                                caption: original.caption,
                                poll_question: original.poll?.question,
                                attachments: original.attachments // [NEW] Pass attachments
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
                            replyTo: processedMsg.replyTo || prev[optimisticIndex].replyTo,
                            // [FIX] Preserve local image blob to prevent flickering/shrinking
                            image_url: (prev[optimisticIndex].image_url && prev[optimisticIndex].image_url.startsWith('blob:')) 
                                ? prev[optimisticIndex].image_url 
                                : processedMsg.image_url,
                            localBlob: prev[optimisticIndex].localBlob // Preserve the raw file if needed
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
            if (String(roomId) === String(room.id)) {
                setMessages(prev => prev.map(msg => 
                    messageIds.some(id => String(id) === String(msg.id)) ? { ...msg, status } : msg
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
                             caption: updatedMsg.caption !== undefined ? updatedMsg.caption : msg.caption, // [NEW] Update caption if present
                             edited_at: updatedMsg.edited_at,
                             edit_version: updatedMsg.edit_version
                         };
                     }
                     return msg;
                 }));
             }
        };

        const handleMessageViewed = ({ id, userId, viewed_by, room_member_count }) => {
            console.log("Socket message_viewed received:", id, userId);
            setMessages(prev => prev.map(msg => {
                if (String(msg.id) === String(id)) {
                    const nextViewedBy = viewed_by || [...(msg.viewed_by || []), userId];
                    return { 
                        ...msg, 
                        viewed_by: nextViewedBy,
                        room_member_count: room_member_count || msg.room_member_count
                    };
                }
                return msg;
            }));
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
        socket.on('message_viewed', handleMessageViewed);
        socket.on('typing:start', handleTypingStart);
        socket.on('typing:stop', handleTypingStop);

        // [NEW] Pin Events
        socket.on('message_pinned', ({ messageId, roomId, pinnedBy }) => {
             if (String(roomId) === String(room.id)) {
                 setMessages(prev => prev.map(m => 
                     m.id === messageId ? { ...m, is_pinned: true, pinned_by: pinnedBy } : m
                 ));
             }
        });

        socket.on('message_unpinned', ({ messageId, roomId }) => {
             if (String(roomId) === String(room.id)) {
                 setMessages(prev => prev.map(m => 
                     m.id === messageId ? { ...m, is_pinned: false, pinned_by: null } : m
                 ));
             }
        });


        socket.on('chat:cleared', ({ roomId }) => {
            if (String(roomId) === String(room.id)) {
                setMessages([]); 
            }
        });

        // Poll vote update - use named handler so cleanup doesn't remove Dashboard's listener
        const handlePollVote = (data) => {
            const { pollId, roomId, poll, voterId, voterName, pollQuestion, hasVoted } = data;
            if (String(roomId) === String(room.id)) {
                setMessages(prev => prev.map(msg => {
                    if (msg.poll && msg.poll.id === pollId) {
                        // FIX: The poll object from the server contains user_votes relative to the VOTER.
                        // If we blindly replace msg.poll with poll, we overwrite our own vote state with the voter's state.
                        // So, we must only update user_votes if WE are the voter.
                        // Otherwise, we keep our existing user_votes and only update the counts/options.
                        
                        let myUserVotes = msg.poll.user_votes;
                        if (String(voterId) === String(user.id)) {
                             // If I voted, the server's poll data has my correct new votes
                             myUserVotes = poll.user_votes;
                        } 
                        // Else: keep my existing votes (myUserVotes remains msg.poll.user_votes)

                        return { 
                            ...msg, 
                            poll: {
                                ...poll,
                                user_votes: myUserVotes
                            }
                        };
                    }
                    return msg;
                }));
            }
        };
        socket.on('poll_vote', handlePollVote);

        // Poll closed - use named handler for proper cleanup
        const handlePollClosed = ({ pollId, roomId, poll }) => {
            if (String(roomId) === String(room.id)) {
                setMessages(prev => prev.map(msg => {
                    if (msg.poll && msg.poll.id === pollId) {
                        return { ...msg, poll };
                    }
                    return msg;
                }));
            }
        };
        socket.on('poll_closed', handlePollClosed);

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

        // [NEW] Handle member added - update members list for mentions
        const handleMemberAdded = async ({ groupId, userId }) => {
            console.log('[DEBUG] group:member:added event received:', { groupId, userId, currentRoomId: room.id });
            if (String(groupId) === String(room.id)) {
                try {
                    // Fetch the new member's info
                    console.log('[DEBUG] Fetching new member info for userId:', userId);
                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/${userId}/profile`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const newMember = await res.json();
                        console.log('[DEBUG] Fetched new member:', newMember);
                        setMembers(prev => {
                            console.log('[DEBUG] Current members:', prev.map(m => m.id));
                            // Avoid duplicates
                            if (prev.some(m => String(m.id) === String(userId))) {
                                console.log('[DEBUG] Member already exists, skipping');
                                return prev;
                            }
                            console.log('[DEBUG] Adding new member to list');
                            return [...prev, { ...newMember, role: 'member' }];
                        });
                    } else {
                        console.error('[DEBUG] Failed to fetch member, status:', res.status);
                    }
                } catch (err) {
                    console.error('Failed to fetch new member info:', err);
                }
            }
        };

        // [NEW] Handle member removed - update members list
        const handleMemberRemoved = ({ groupId, userId }) => {
            console.log('[DEBUG] group:member:removed event received:', { groupId, userId, currentRoomId: room.id });
            if (String(groupId) === String(room.id)) {
                setMembers(prev => prev.filter(m => String(m.id) !== String(userId)));
            }
        };

        socket.on('group:member:added', handleMemberAdded);
        socket.on('group:member:removed', handleMemberRemoved);

        return () => {
            socket.off('new_message', handleNewMessage);
            socket.off('messages_status_update', handleStatusUpdate);
            socket.off('message_deleted', handleMessageDeleted);
            socket.off('message_edited', handleMessageEdited);
            socket.off('typing:start', handleTypingStart);
            socket.off('typing:stop', handleTypingStop);
            socket.off('message_viewed', handleMessageViewed);
            socket.off('chat:cleared'); 
            socket.off('poll_vote', handlePollVote);
            socket.off('poll_closed', handlePollClosed);
            socket.off('user:profile:updated', handleProfileUpdate);
            socket.off('group:member:added', handleMemberAdded);
            socket.off('group:member:removed', handleMemberRemoved);
            
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
        };
    }, [socket, room, token]);

    const handleLocalDelete = (messageId) => {
        setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const handleSend = async (content, replyToMsg) => {
        if (!isExpired) {
            // [FIX] Use state replyTo if not passed as arg
            const finalReplyTo = replyToMsg || replyTo;

            const tempId = `temp-${Date.now()}`;
            const tempMsg = {
                id: tempId,
                room_id: room.id,
                user_id: user.id,
                content,
                replyTo: finalReplyTo || null,
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
                replyToMessageId: finalReplyTo ? finalReplyTo.id : null,
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
        // [FIX] Use state fallback
        const finalReplyTo = replyToMsg || replyTo;

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
            replyTo: finalReplyTo || null,
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
        if (finalReplyTo) formData.append('replyToMessageId', finalReplyTo.id);
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

    const handleRetry = async (msg) => {
        if (!msg.localBlob) return;
        
        setMessages(prev => prev.map(m => 
            m.id === msg.id ? { ...m, uploadStatus: 'uploading', uploadProgress: 0, status: 'sending' } : m
        ));

        const formData = new FormData();
        formData.append('roomId', room.id);
        if (msg.replyTo) formData.append('replyToMessageId', msg.replyTo.id);
        formData.append('tempId', msg.id);

        if (msg.type === 'audio') {
            formData.append('audio', msg.localBlob);
            formData.append('durationMs', msg.audio_duration_ms);
            formData.append('waveform', JSON.stringify(msg.audio_waveform));
            
            try {
                await uploadAudioWithProgress(formData, msg.id);
            } catch (err) {
                console.error(err);
                setMessages(prev => prev.map(m => 
                    m.id === msg.id ? { ...m, uploadStatus: 'failed', status: 'error' } : m
                ));
            }
        } else if (msg.type === 'image') {
            // [FIX] Retry for multiple images? Complicated if single message has multiple.
            // If message was created successfully but upload failed, we'd need to re-upload.
            // If backend supports re-uploading to same ID? Or just new message?
            // Current retry logic creates new upload request for the temp ID.
            // If attachments, we need to handle that.
            // For now, let's assume retry just re-sends the blob as a single image (fallback) or we need to store array of blobs.
            // To simplify, if it's a multi-image message, `localBlob` should be an array or `localBlobs`.
            
            if (msg.localBlobs && msg.localBlobs.length > 0) {
                 const formData = new FormData();
                 msg.localBlobs.forEach(b => formData.append('images', b));
                 // Append metadata if needed
            } else {
                 formData.append('images', msg.localBlob);
            }
            
            formData.append('caption', msg.caption || '');
            // Retry logic might need more work for multiple images, keeping simple for now.

            try {
                await uploadImageWithProgress(formData, msg.id);
            } catch (err) {
                 console.error(err);
                 setMessages(prev => prev.map(m =>
                    m.id === msg.id ? { ...m, status: 'error' } : m
                ));
            }
        }
    };

    const handleEditMessage = async (msgId, newContent) => {
        setMessages(prev => prev.map(m => 
            m.id === msgId 
            ? { 
                ...m, 
                content: newContent, // Always update content (matches backend)
                caption: m.type === 'image' ? newContent : m.caption, // [NEW] Update caption if image
                edited_at: new Date().toISOString(), 
                edit_version: (m.edit_version || 0) + 1 
            } 
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
        
        if (typingUsers.length === 1) {
            return (
                <span className="truncate max-w-[200px] flex items-center gap-1">
                    <span className="font-semibold truncate">{renderTextWithEmojis(typingUsers[0].name)}</span> 
                    <span className="shrink-0">is typing...</span>
                </span>
            );
        }
        if (typingUsers.length === 2) {
            return (
                <span className="truncate max-w-[300px] flex items-center gap-1">
                    <span className="font-semibold truncate">{renderTextWithEmojis(typingUsers[0].name)}</span> 
                    <span className="shrink-0">and</span>
                    <span className="font-semibold truncate">{renderTextWithEmojis(typingUsers[1].name)}</span> 
                    <span className="shrink-0">are typing...</span>
                </span>
            );
        }
        return (
            <span className="truncate max-w-[300px] flex items-center gap-1">
                <span className="font-semibold truncate">{renderTextWithEmojis(typingUsers[0].name)}</span>
                <span className="shrink-0">,</span>
                <span className="font-semibold truncate">{renderTextWithEmojis(typingUsers[1].name)}</span>
                <span className="shrink-0">, and {typingUsers.length - 2} others are typing...</span>
            </span>
        );
    };

    const extractTextFromHtml = (html) => {
        if (!html) return "";
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        // Replace img alt with text
        const images = tempDiv.getElementsByTagName('img');
        while (images.length > 0) {
            const img = images[0];
            const alt = img.getAttribute('alt') || '';
            const textNode = document.createTextNode(alt);
            img.parentNode.replaceChild(textNode, img);
        }
        return (tempDiv.textContent || "").trim();
    };

    const handleSendImages = async (items, isViewOnce) => {
        // items: [{ file, width, height, caption (html) }]
        console.log('[DEBUG] ChatWindow handleSendImages:', items.length, 'items');

        // Pre-process captions to plain text
        const processedItems = items.map(item => ({
            ...item,
            plainCaption: extractTextFromHtml(item.caption)
        }));

        // Determine Splitting Logic
        // distinctCaptions: filter out empty, then get unique
        const captions = processedItems.map(i => i.plainCaption).filter(c => c.length > 0);
        // If we have distinct captions for different images, we probably want to split.
        // Requirement: "if they give separte caption of each image then upload pictures not in one grid then uload one by one"
        // "and if user give only one caption in any image and blak others and upload in grid and show the caption"
        
        // Logic:
        // 1. If > 1 non-empty caption: SPLIT ALL.
        // 2. If <= 1 non-empty caption: GROUP ALL (use that one caption).
        
        const nonEmptyCount = processedItems.filter(i => i.plainCaption.length > 0).length;
        const shouldSplit = nonEmptyCount > 1;

        if (shouldSplit) {
            // SEND INDIVIDUALLY
            for (const item of processedItems) {
                await sendSingleImage(item.file, item.plainCaption, item.width, item.height, isViewOnce);
            }
        } else {
            // SEND AS GROUP
            // Find the single caption if it exists
            const groupCaption = processedItems.find(i => i.plainCaption.length > 0)?.plainCaption || "";
            await sendImageGroup(processedItems, groupCaption, isViewOnce);
        }
    };

    // Helper for Single Image Send (Splitted)
    const sendSingleImage = async (file, caption, width, height, isViewOnce) => {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Optimistic
        const tempMsg = {
            id: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'image',
            content: 'Image',
            caption: caption || '',
            image_url: URL.createObjectURL(file),
            image_width: width,
            image_height: height,
            image_size: file.size,
            attachments: [{ 
                url: URL.createObjectURL(file), 
                width, 
                height, 
                size: file.size, 
                type: 'image' 
            }], 
            replyTo: replyTo || null,
            created_at: new Date().toISOString(),
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            uploadStatus: 'uploading',
            uploadProgress: 0,
            localBlobs: [file],
            is_view_once: isViewOnce,
            viewed_by: []
        };
        
        setMessages(prev => [...prev, tempMsg]);
        // Note: We don't clear replyTo here immediately if we are in a loop? 
        // Actually, normally reply applies to the "batch". 
        // If we split, presumably the first one (or all?) get the reply?
        // Standard behavior: Reply applies to the context. If I send 5 images, do they all reply?
        // Let's assume yes for now, or just the first.
        // If I maintain `replyTo` in state, it might persist?
        // `setReplyTo(null)` is called. If I call it after the first, subsequent won't have it.
        // Let's clear it ONLY after the loop in `handleSendImages`? 
        // Refactor: Pass replyTo snapshot to this function.
        
        const formData = new FormData();
        formData.append('roomId', room.id);
        formData.append('caption', caption || '');
        formData.append('isViewOnce', isViewOnce);
        if (replyTo) formData.append('replyToMessageId', replyTo.id);
        formData.append('tempId', tempId);
        formData.append('widths', width);
        formData.append('heights', height);
        formData.append('images', file);

        try {
            await uploadImageWithProgress(formData, tempId);
        } catch (err) {
            console.error(err);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
        }
    };

    // Helper for Group Send
    const sendImageGroup = async (items, groupCaption, isViewOnce) => {
        const tempId = `temp-${Date.now()}`;
        
        const attachments = items.map(item => ({
            url: URL.createObjectURL(item.file),
            width: item.width,
            height: item.height,
            size: item.file.size,
            type: 'image'
        }));

        const tempMsg = {
            id: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'image',
            content: 'Image',
            caption: groupCaption || '',
            // Legacy props (first image)
            image_url: attachments[0].url,
            image_width: attachments[0].width,
            image_height: attachments[0].height,
            image_size: attachments[0].size,
            attachments: attachments, 
            replyTo: replyTo || null,
            created_at: new Date().toISOString(),
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            uploadStatus: 'uploading',
            uploadProgress: 0,
            localBlobs: items.map(i => i.file),
            is_view_once: isViewOnce,
            viewed_by: []
        };
        
        setMessages(prev => [...prev, tempMsg]);
        
        const formData = new FormData();
        formData.append('roomId', room.id);
        formData.append('caption', groupCaption || '');
        formData.append('isViewOnce', isViewOnce);
        if (replyTo) formData.append('replyToMessageId', replyTo.id);
        formData.append('tempId', tempId);

        items.forEach(item => {
            formData.append('widths', item.width);
            formData.append('heights', item.height);
            formData.append('images', item.file);
        });

        try {
            await uploadImageWithProgress(formData, tempId);
        } catch (err) {
            console.error(err);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
        }
    };

    const uploadImageWithProgress = async (formData, tempId) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${import.meta.env.VITE_API_URL}/api/messages/image`);
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
    // [NEW] Handler for when image is selected in MessageInput
    const handleImageSelected = (files) => {
        // Normalize to array
        const fileList = Array.isArray(files) ? files : [files];
        setSelectedImages(fileList);
    };

    // [NEW] Handler for sending from Preview Modal
    const handleSendImageConfirm = async (payload, isViewOnce) => {
         await handleSendImages(payload, isViewOnce);
         setReplyTo(null); // Clear reply context after everything
         setSelectedImages(null);
    };

    // [NEW] File Handlers
    const handleFileSelected = (files) => {
        const fileList = Array.isArray(files) ? files : [files];
        setSelectedFiles(fileList);
    };

    const handleSendFileConfirm = (filesWithCaptions) => {
        filesWithCaptions.forEach(({ file, caption }) => {
            handleSendFile(file, caption);
        });
        setSelectedFiles(null);
    };

    const uploadFileWithProgress = async (formData, tempId) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${import.meta.env.VITE_API_URL}/api/messages/file`);
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

    const handleSendFile = async (file, caption) => {
        // [FIX] Use random suffix to prevent ID collision in fast loops
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const tempMsg = {
            id: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'file',
            content: 'File',
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            file_extension: file.name.split('.').pop(),
            caption: caption || '', // [NEW]
            replyTo: replyTo || null,
            created_at: new Date().toISOString(),
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            uploadStatus: 'uploading',
            uploadProgress: 0,
            localBlob: file
        };
        setMessages(prev => [...prev, tempMsg]);
        setReplyTo(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomId', room.id);
        formData.append('tempId', tempId);
        formData.append('caption', caption || ''); // [NEW]
        if (replyTo) formData.append('replyToMessageId', replyTo.id);

        try {
            await uploadFileWithProgress(formData, tempId);
        } catch (err) {
            console.error(err);
            setMessages(prev => prev.map(m =>
                m.id === tempId ? { ...m, status: 'error', uploadStatus: 'failed' } : m
            ));
        }
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
        <div className="flex flex-col h-[100dvh] bg-gray-50 dark:bg-slate-950 relative overflow-hidden transition-colors chat-container"> {/* Added class for reference */}
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

            {/* [NEW] Pinned Messages Panel */}
            <PinnedMessagesPanel 
                roomId={room.id}
                onGoToMessage={(msgId) => {
                    const el = document.getElementById(`msg-${msgId}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('reply-highlight');
                        setTimeout(() => el.classList.remove('reply-highlight'), 2000);
                    }
                }}
                onUnpin={(msgId) => {
                    setMessages(prev => prev.map(m => 
                        m.id === msgId ? { ...m, is_pinned: false } : m
                    ));
                }}
                socket={socket}
            />

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
                    onRetry={handleRetry} 
                    onEdit={setEditingMessage}
                    onPin={(msg) => {
                        if (msg.is_pinned) {
                            // Unpin directly
                            fetch(
                                `${import.meta.env.VITE_API_URL}/api/messages/${msg.id}/pin`,
                                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
                            ).then(res => {
                                if (res.ok) {
                                    setMessages(prev => prev.map(m => 
                                        m.id === msg.id ? { ...m, is_pinned: false } : m
                                    ));
                                }
                            }).catch(console.error);
                        } else {
                            // Show duration modal for pinning
                            setPinToConfirm(msg);
                        }
                    }}
                    searchTerm={searchTerm} 
                    onLoadMore={handleLoadOlderMessages}
                    hasMore={hasMore}
                    loadingMore={loadingMore}
                    isAiChat={room.other_user_id === 'ai-assistant' || room.id === 'ai-chat' || room.type === 'ai'}
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
                    onSend={handleSend}         
                    onSendAudio={handleSendAudio}
                    onImageSelected={handleImageSelected}
                    onFileSelected={handleFileSelected}
                    onSendGif={handleSendGif}
                    onLocationClick={() => setShowLocationPicker(true)}
                    onPollClick={() => setShowCreatePoll(true)}
                    disabled={!canSend || isExpired}
                    replyTo={replyTo}          
                    setReplyTo={setReplyTo}
                    
                    editingMessage={editingMessage}
                    onCancelEdit={() => setEditingMessage(null)}
                    onEditMessage={handleEditMessage}
                    onTypingStart={() => socket?.emit('typing:start', { roomId: room.id })}
                    onTypingStop={() => socket?.emit('typing:stop', { roomId: room.id })}
                    members={members}
                    currentUser={user}
                    roomId={room.id}
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
                    onGoToMessage={(msgId) => {
                        setShowProfileCard(false);
                        if (onGoToMessage) onGoToMessage(msgId);
                    }}
                />
            )}

            {/* [NEW] Scoped Image Preview Modal */}
            {selectedImages && (
                <div className="absolute inset-0 z-20 flex flex-col bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <ImagePreviewModal 
                        files={selectedImages} 
                        onClose={() => setSelectedImages(null)}
                        onSend={handleSendImageConfirm}
                        recipientName={room.type === 'direct' ? room.name : room.name}
                        recipientAvatar={room.type === 'direct' ? (room.avatar_url || room.avatar_thumb_url) : (room.avatar_url || room.avatar_thumb_url)}
                    />
                </div>
            )}
            {/* [NEW] Scoped File Preview Modal */}
            {selectedFiles && (
                <div className="absolute inset-0 z-20 flex flex-col bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <FilePreviewModal 
                        files={selectedFiles} 
                        onClose={() => setSelectedFiles(null)}
                        onSend={handleSendFileConfirm}
                        recipientName={room.type === 'direct' ? room.name : room.name}
                        recipientAvatar={room.type === 'direct' ? (room.avatar_url || room.avatar_thumb_url) : (room.avatar_url || room.avatar_thumb_url)}
                    />
                </div>
            )}

            {/* [NEW] Location Picker Modal */}
            <LocationPicker 
                isOpen={showLocationPicker}
                onClose={() => setShowLocationPicker(false)}
                onSend={async (location) => {
                    const tempId = `temp-${Date.now()}`;
                    const tempMsg = {
                        id: tempId,
                        room_id: room.id,
                        user_id: user.id,
                        type: 'location',
                        content: location.address || 'Location',
                        latitude: location.latitude,
                        longitude: location.longitude,
                        address: location.address,
                        created_at: new Date().toISOString(),
                        username: user.username,
                        display_name: user.display_name,
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
                                type: 'location',
                                latitude: location.latitude,
                                longitude: location.longitude,
                                address: location.address,
                                tempId
                            })
                        });
                    } catch (err) {
                        console.error('Failed to send location:', err);
                        setMessages(prev => prev.map(m => 
                            m.id === tempId ? { ...m, status: 'error' } : m
                        ));
                    }
                }}
            />

            {/* [NEW] Create Poll Modal */}
            <CreatePollModal 
                isOpen={showCreatePoll}
                onClose={() => setShowCreatePoll(false)}
                onSubmit={async (pollData) => {
                    try {
                        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/polls`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                room_id: room.id,
                                ...pollData
                            })
                        });
                        if (!res.ok) throw new Error('Failed to create poll');
                    } catch (err) {
                        console.error('Failed to create poll:', err);
                        throw err;
                    }
                }}
            />

            {/* [NEW] Pin Duration Modal */}
            <PinDurationModal 
                isOpen={!!pinToConfirm}
                onClose={() => setPinToConfirm(null)}
                message={pinToConfirm}
                onPin={async (msg, durationHours) => {
                    // Optimistic update - show pinned immediately
                    setMessages(prev => prev.map(m => 
                        m.id === msg.id ? { ...m, is_pinned: true, pinned_by: user.id } : m
                    ));
                    
                    try {
                        const res = await fetch(
                            `${import.meta.env.VITE_API_URL}/api/messages/${msg.id}/pin`,
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${token}`
                                },
                                body: JSON.stringify({ durationHours })
                            }
                        );
                        if (!res.ok) {
                            // Revert on failure
                            setMessages(prev => prev.map(m => 
                                m.id === msg.id ? { ...m, is_pinned: false, pinned_by: null } : m
                            ));
                        }
                    } catch (err) {
                        console.error('Failed to pin:', err);
                        // Revert on error
                        setMessages(prev => prev.map(m => 
                            m.id === msg.id ? { ...m, is_pinned: false, pinned_by: null } : m
                        ));
                    }
                }}
            />
        </div>
    );
}

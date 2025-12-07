import { useState, useEffect } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useAuth } from '../context/AuthContext';

export default function ChatWindow({ socket, room, user, onBack, showGroupInfo, setShowGroupInfo }) {
    const { token } = useAuth();
    const [messages, setMessages] = useState([]);
    const [isExpired, setIsExpired] = useState(false);
    const [replyTo, setReplyTo] = useState(null); // [NEW] Reply state
    // const [showInfoModal, setShowInfoModal] = useState(false); // Prop driven now

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
        if (!socket || !room) return;

        // Check expiry
        if (room.expires_at && new Date(room.expires_at) < new Date()) {
            setIsExpired(true);
        } else {
            setIsExpired(false);
        }

        // Fetch history
        fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            // Hydrate reply data
            const byId = new Map(data.map(m => [m.id, m]));
            const hydrated = data.map(m => {
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
            setMessages(hydrated);
        })
        .catch(err => console.error(err));

        // Join room
        socket.emit('join_room', room.id);

        // Listen for messages
        const handleNewMessage = (msg) => {
            console.log('Received new_message:', msg, 'Current room:', room.id);
            if (msg.room_id === room.id) {
                setMessages(prev => {
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
                                text: snippet
                            };
                        }
                    }

                    // Check for optimistic message to replace
                    // We match by content and user_id, ensuring unique replacement if possible
                    // Ideally we'd use a tempId from client, but purely content matching for now is "okay" for this scope
                    // taking the last one that matches
                    const reversedIndex = [...prev].reverse().findIndex(m => 
                        m.status === 'sending' && 
                        m.content === processedMsg.content && 
                        m.user_id === processedMsg.user_id
                    );
                    
                    if (reversedIndex !== -1) {
                        const index = prev.length - 1 - reversedIndex;
                        const newMsgs = [...prev];
                        // Preserve replyTo from the optimistic message if the server message doesn't have it (or if checking against temp)
                        const preservedMsg = { 
                            ...processedMsg, 
                            replyTo: processedMsg.replyTo || prev[index].replyTo 
                        };
                        newMsgs[index] = preservedMsg; // Replace with real message
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

        socket.on('new_message', handleNewMessage);
        socket.on('messages_status_update', handleStatusUpdate);
        socket.on('message_deleted', handleMessageDeleted);

        return () => {
            socket.off('new_message', handleNewMessage);
            socket.off('messages_status_update', handleStatusUpdate);
            socket.off('message_deleted', handleMessageDeleted);
        };
    }, [socket, room, token]);

    const handleLocalDelete = (messageId) => {
        setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const handleSend = (content, replyToMsg) => { // [MODIFY] accept replyToMsg
        if (socket && !isExpired) {
            // Optimistic Update
            const tempMsg = {
                id: `temp-${Date.now()}`,
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
                replyToMessageId: replyToMsg ? replyToMsg.id : null // [NEW] send ID
            });
            setReplyTo(null); // [NEW] Clear reply after sending
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

                <div className="flex-1">
                    <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        {room.type === 'group' && (
                            <span className="material-symbols-outlined text-violet-400">tag</span>
                        )}
                        {room.name}
                        {room.type === 'group' && (
                            <span className="text-xs bg-slate-800 px-2 py-1 rounded-md text-slate-400 font-mono border border-slate-700 ml-2">
                                {room.code}
                            </span>
                        )}
                    </h2>
                    {room.type === 'direct' && room.username && (
                        <p className="text-xs text-slate-400 font-medium">
                            {room.username.startsWith('@') ? room.username : `@${room.username}`}
                        </p>
                    )}

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
                        title="Group Info"
                    >
                        <span className="material-symbols-outlined">info</span>
                    </button>
                )}
            </div>

            <MessageList 
                messages={messages} 
                setMessages={setMessages} // [NEW] Pass setter for optimistic updates
                currentUser={user} 
                roomId={room.id} 
                socket={socket} 
                onReply={setReplyTo} 
                onDelete={handleLocalDelete}
            />
            
            <MessageInput 
                onSend={(content) => handleSend(content, replyTo)} // [NEW] inject replyTo
                disabled={isExpired} 
                replyTo={replyTo}          // [NEW] Pass state
                setReplyTo={setReplyTo}    // [NEW] Pass setter
            />


        </div>
    );
}

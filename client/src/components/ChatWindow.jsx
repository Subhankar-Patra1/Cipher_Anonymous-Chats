import { useState, useEffect } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useAuth } from '../context/AuthContext';

export default function ChatWindow({ socket, room, user, onBack, showGroupInfo, setShowGroupInfo }) {
    const { token } = useAuth();
    const [messages, setMessages] = useState([]);
    const [isExpired, setIsExpired] = useState(false);
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
        .then(data => setMessages(data))
        .catch(err => console.error(err));

        // Join room
        socket.emit('join_room', room.id);

        // Listen for messages
        const handleNewMessage = (msg) => {
            console.log('Received new_message:', msg, 'Current room:', room.id);
            if (msg.room_id === room.id) {
                setMessages(prev => [...prev, msg]);
            } else {
                console.log('Message not for this room');
            }
        };

        socket.on('new_message', handleNewMessage);

        return () => {
            socket.off('new_message', handleNewMessage);
        };
    }, [socket, room, token]);

    const handleSend = (content) => {
        if (socket && !isExpired) {
            socket.emit('send_message', { roomId: room.id, content });
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
                        <p className="text-xs text-slate-400 font-medium">@{room.username}</p>
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

            <MessageList messages={messages} currentUser={user} roomId={room.id} />
            
            <MessageInput onSend={handleSend} disabled={isExpired} />


        </div>
    );
}

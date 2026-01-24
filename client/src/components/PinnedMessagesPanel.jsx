import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

/**
 * PinnedMessagesPanel - WhatsApp-style pinned message header bar
 * Shows a single pinned message preview with dropdown for multiple pins
 */
export default function PinnedMessagesPanel({ roomId, onGoToMessage, onUnpin, socket, decryptMessage }) {
    const { token, user } = useAuth();
    const [pinnedMessages, setPinnedMessages] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    // Fetch pinned messages
    useEffect(() => {
        if (!roomId) return;
        
        const cacheKey = `pinned_msgs_${roomId}`;

        // 1. Load from cache immediately
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setPinnedMessages(parsed);
                setLoading(false); 
            } catch (e) { console.error('Cache parse error', e); }
        }

        const fetchPinned = async () => {
            try {
                const res = await fetch(
                    `${import.meta.env.VITE_API_URL}/api/messages/room/${roomId}/pinned`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.ok) {
                    const data = await res.json();
                    
                    let finalData = data;
                    // [NEW] Decrypt messages
                    if (decryptMessage) {
                        const decrypted = await Promise.all(
                            data.map(async (msg) => {
                                try {
                                    return await decryptMessage(msg);
                                } catch (e) {
                                    console.error('Pinned msg decryption failed', e);
                                    return msg;
                                }
                            })
                        );
                        finalData = decrypted;
                    }
                    
                    setPinnedMessages(finalData);
                    localStorage.setItem(cacheKey, JSON.stringify(finalData));
                }
            } catch (err) {
                console.error('Failed to fetch pinned messages:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPinned();
    }, [roomId, token]);

    // Listen for socket events
    useEffect(() => {
        if (!socket) return;

        const handlePinned = (data) => {
            if (String(data.roomId) === String(roomId)) {
                // Refetch pinned messages
                fetch(`${import.meta.env.VITE_API_URL}/api/messages/room/${roomId}/pinned`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                .then(res => res.json())
                .then(async data => {
                     // [NEW] Decrypt on socket update too
                     if (decryptMessage) {
                         const decrypted = await Promise.all(data.map(m => decryptMessage(m)));
                         setPinnedMessages(decrypted);
                     } else {
                         setPinnedMessages(data);
                     }
                })
                .catch(console.error);
            }
        };

        const handleUnpinned = (data) => {
            if (String(data.roomId) === String(roomId)) {
                setPinnedMessages(prev => prev.filter(m => m.id !== data.messageId));
            }
        };

        const handleMessageEdited = (updatedMsg) => {
            setPinnedMessages(prev => {
                const index = prev.findIndex(m => String(m.id) === String(updatedMsg.id));
                if (index === -1) return prev;

                const newPinned = [...prev];
                const merged = { ...newPinned[index], ...updatedMsg };
                
                // Process re-decryption in background if needed
                if (decryptMessage && (merged.ciphertext || merged.caption_ciphertext)) {
                    decryptMessage(merged).then(decrypted => {
                        setPinnedMessages(latest => 
                            latest.map(m => String(m.id) === String(updatedMsg.id) ? decrypted : m)
                        );
                    }).catch(console.error);
                }
                
                newPinned[index] = merged;
                return newPinned;
            });
        };

        socket.on('message_pinned', handlePinned);
        socket.on('message_unpinned', handleUnpinned);
        socket.on('message_edited', handleMessageEdited);

        // [NEW] Clear pinned messages when chat is cleared
        const handleChatCleared = (data) => {
            if (String(data.roomId) === String(roomId)) {
                setPinnedMessages([]);
                localStorage.removeItem(`pinned_msgs_${roomId}`);
            }
        };
        socket.on('chat:cleared', handleChatCleared);

        return () => {
            socket.off('message_pinned', handlePinned);
            socket.off('message_unpinned', handleUnpinned);
            socket.off('message_edited', handleMessageEdited);
            socket.off('chat:cleared', handleChatCleared);
        };
    }, [socket, roomId, token]);

    const handleUnpin = async (messageId) => {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_URL}/api/messages/${messageId}/pin`,
                { 
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` } 
                }
            );
            if (res.ok) {
                setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
                onUnpin?.(messageId);
                setShowDropdown(false);
            }
        } catch (err) {
            console.error('Failed to unpin message:', err);
        }
    };

    const getMessagePreview = (msg) => {
        if (msg.type === 'image') {
            if (msg.caption && msg.caption !== 'Image') return msg.caption;
            if (msg.content && msg.content !== 'Image') return msg.content;
            return 'Photo';
        }
        if (msg.type === 'audio') return '🎤 Voice message';
        if (msg.type === 'file') return `📎 ${msg.file_name || 'File'}`;
        if (msg.type === 'gif') return '🎞️ GIF';
        if (msg.type === 'location') return '📍 Location';
        if (msg.type === 'poll') return `📊 ${msg.poll?.question || msg.poll_question || 'Poll'}`;
        if (msg.type === 'todo') return msg.todo?.title || msg.todo_title || 'To-Do List';
        return msg.content?.slice(0, 80) || '';
    };

    if (loading) return null;
    if (pinnedMessages.length === 0) return null;

    const currentPinned = pinnedMessages[currentIndex] || pinnedMessages[0];

    return (
        <div className="relative">
            {/* Main Bar */}
            <div 
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors"
                onClick={() => {
                    if (pinnedMessages.length === 1) {
                        onGoToMessage(currentPinned.id);
                    } else {
                        setShowDropdown(!showDropdown);
                    }
                }}
            >
                {/* Pin Icon with indicator bar */}
                <div className="flex items-center gap-1">
                    <div className="w-1 h-6 bg-violet-500 rounded-full" />
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-lg">push_pin</span>
                </div>

                {/* Message Preview */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-200 truncate flex items-center">
                        {currentPinned.type === 'todo' && <span className="material-symbols-outlined text-[16px] mr-1 translate-y-[1px]">checklist</span>}
                        {currentPinned.type === 'image' && <span className="material-symbols-outlined text-[16px] mr-1 translate-y-[1px]">image</span>}
                        <span className="truncate">{renderTextWithEmojis(getMessagePreview(currentPinned), '1.25em')}</span>
                    </p>
                </div>

                {/* Count / Actions */}
                <div className="flex items-center gap-2">
                    {pinnedMessages.length > 1 && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                            {currentIndex + 1}/{pinnedMessages.length}
                        </span>
                    )}
                    <span className={`material-symbols-outlined text-slate-400 text-lg transition-transform ${showDropdown ? 'rotate-180' : ''}`}>
                        expand_more
                    </span>
                </div>
            </div>

            {/* Dropdown Menu */}
            {showDropdown && (
                <>
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 z-40"
                        onClick={() => setShowDropdown(false)}
                    />
                    
                    {/* Menu */}
                    <div className="absolute top-full left-0 right-0 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-b-xl shadow-xl max-h-[220px] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-150">
                        {pinnedMessages.map((msg, index) => (
                            <div
                                key={msg.id}
                                className="flex items-center gap-2 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                            >
                                {/* Click to go to message */}
                                <div 
                                    className="flex-1 min-w-0 cursor-pointer"
                                    onClick={() => {
                                        setCurrentIndex(index);
                                        onGoToMessage(msg.id);
                                        setShowDropdown(false);
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        {msg.avatar_thumb_url ? (
                                            <img src={msg.avatar_thumb_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                                        ) : (
                                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">
                                                {(msg.display_name?.replace(/[\uD800-\uDFFF]/g, '')?.[0] || '?').toUpperCase()}
                                            </div>
                                        )}
                                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                            {renderTextWithEmojis(msg.display_name, '1.25em')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 truncate mt-1 ml-8 flex items-center">
                                        {msg.type === 'todo' && <span className="material-symbols-outlined text-[16px] mr-1 translate-y-[1px]">checklist</span>}
                                        {msg.type === 'image' && <span className="material-symbols-outlined text-[16px] mr-1 translate-y-[1px]">image</span>}
                                        <span className="truncate">{renderTextWithEmojis(getMessagePreview(msg), '1.25em')}</span>
                                    </p>
                                </div>

                                {/* Dropdown actions */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleUnpin(msg.id);
                                        }}
                                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        title="Unpin"
                                    >
                                        <span className="material-symbols-outlined text-lg">keep_off</span>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onGoToMessage(msg.id);
                                            setShowDropdown(false);
                                        }}
                                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        title="Go to message"
                                    >
                                        <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

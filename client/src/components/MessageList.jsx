import { useEffect, useRef, useState } from 'react';
import emojiRegex from 'emoji-regex';
import { useAuth } from '../context/AuthContext';

// Helper to convert emoji to hex code, stripping VS16 (fe0f) for CDN compatibility
const toHex = (emoji) => {
    return Array.from(emoji)
        .map(c => c.codePointAt(0).toString(16))
        .filter(hex => hex !== 'fe0f') // Strip variation selector 16
        .join('-');
};

// Custom renderer to replace emoji chars with Apple images
const renderEmoji = (text) => {
    if (!text) return null;
    const regex = emojiRegex();
    
    const elements = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
        const emojiChar = match[0];
        const index = match.index;
        
        if (index > lastIndex) {
            elements.push(<span key={key++}>{text.substring(lastIndex, index)}</span>);
        }
        
        const hex = toHex(emojiChar);
        elements.push(
            <img 
                key={key++}
                src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`}
                alt={emojiChar}
                className="w-5 h-5 inline-block align-bottom mx-[1px]"
                draggable="false"
                loading="lazy"
                onError={(e) => {
                    // Fallback to native text if image fails
                    e.currentTarget.style.display = 'none';
                    const span = document.createElement('span');
                    span.textContent = emojiChar;
                    if (e.currentTarget.parentNode) {
                        e.currentTarget.parentNode.insertBefore(span, e.currentTarget);
                    }
                }}
            />
        );
        
        lastIndex = regex.lastIndex;
    }
    
    if (lastIndex < text.length) {
        elements.push(<span key={key++}>{text.substring(lastIndex)}</span>);
    }
    
    return elements;
};

const MessageItem = ({ msg, isMe, onReply, onDelete, onDeleteForEveryone }) => {
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);
    const { token, user } = useAuth(); 

    const toggleMenu = (e) => {
        e.stopPropagation();
        setShowMenu(prev => !prev);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };

        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMenu]);

    const scrollToMessage = (id) => {
        const el = document.getElementById(`msg-${id}`);
        if (!el) return;

        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("reply-highlight");
        setTimeout(() => {
            el.classList.remove("reply-highlight");
        }, 1600);
    };

    const handleDeleteForMe = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${msg.id}/for-me`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                onDelete(msg.id);
            }
        } catch (err) {
            console.error(err);
        }
        setShowMenu(false);
    };



    const isDeletedForMe = Array.isArray(msg.deleted_for_user_ids) && 
                           msg.deleted_for_user_ids.includes(String(user.id));
    
    if (isDeletedForMe) return null;

    if (msg.is_deleted_for_everyone) {
        return (
            <div 
                id={`msg-${msg.id}`}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} group max-w-full my-1`}
            >
                <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`
                         px-3 py-2 text-sm italic text-slate-400
                         ${isMe 
                             ? 'bg-slate-900/50 rounded-2xl rounded-tr-sm border border-slate-800' 
                             : 'bg-slate-900/50 rounded-2xl rounded-tl-sm border border-slate-800'
                         }
                    `}>
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">block</span>
                            <span>This message was deleted</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div 
            id={`msg-${msg.id}`}
            className={`flex ${isMe ? 'justify-end' : 'justify-start'} group max-w-full animate-slide-in-up`}
        >
            <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                    <div className="flex items-center gap-2 mb-1 ml-1 select-none">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[10px] text-white font-bold">
                            {(msg.display_name || msg.username || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-xs text-slate-400 font-medium">
                            {msg.display_name || msg.username}
                        </span>
                    </div>
                )}
                
                <div className="relative group">
                    <div className={`
                        px-4 py-3 shadow-md text-sm leading-relaxed break-words relative overflow-hidden whitespace-pre-wrap
                        ${isMe 
                            ? 'bg-violet-600 text-white rounded-2xl rounded-tr-sm' 
                            : 'bg-slate-800 text-slate-200 rounded-2xl rounded-tl-sm border border-slate-700'
                        }
                    `}>
                        {msg.replyTo && (
                            <div 
                                onClick={() => scrollToMessage(msg.replyTo.id)} 
                                className={`
                                    mb-1 p-2 rounded-lg cursor-pointer
                                    border-l-4 border-violet-400
                                    transition-colors hover:bg-black/25
                                    ${isMe ? 'bg-black/15' : 'bg-black/15'}
                                `}
                            >
                                <div className="text-xs font-bold text-violet-300 mb-0.5">
                                    {msg.replyTo.sender}
                                </div>
                                <div className="text-xs opacity-80 line-clamp-2">
                                    {msg.replyTo.text}
                                </div>
                            </div>
                        )}

                        <p className="pr-10">
                            {renderEmoji(msg.content)}
                        </p>
                        
                        {isMe && (
                            <div className="absolute bottom-1 right-3 flex items-center gap-1 text-violet-200/80">
                                {msg.status === 'sending' && <span className="material-symbols-outlined text-[10px] animate-spin">progress_activity</span>}
                                {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px]">check</span>}
                                {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px]">check_circle</span>}
                                {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-white font-bold filled">done_all</span>}
                            </div>
                        )}
                    </div>

                <div className={`
                    absolute top-1/2 -translate-y-1/2
                    ${isMe ? 'right-full mr-2' : 'left-full ml-2'}
                    z-10
                `}>
                    <button
                        type="button"
                        className={`
                            opacity-0 group-hover:opacity-100
                            transition-opacity duration-150
                            text-slate-300 hover:text-white
                            p-1 rounded-full
                        `}
                        onClick={toggleMenu}
                    >
                        ⋯
                    </button>

                    {showMenu && (
                        <div
                            ref={menuRef}
                            className={`
                                absolute top-full mt-2
                                left-1/2 -translate-x-1/2
                                w-48
                                rounded-2xl
                                bg-slate-900
                                border border-slate-700/70
                                shadow-2xl shadow-black/60
                                py-1
                                z-50
                            `}
                        >
                            <button 
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-slate-800 rounded-t-2xl"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const raw = msg.content || "";
                                    const normalized = raw.replace(/\s+/g, " ").trim();
                                    const maxLen = 120;
                                    const snippet = normalized.length > maxLen ? normalized.slice(0, maxLen) + "…" : normalized;
                                    onReply({
                                        id: msg.id,
                                        sender: msg.display_name || msg.username,
                                        text: snippet
                                    });
                                    setShowMenu(false);
                                }}
                            >
                                <span className="material-symbols-outlined text-base">reply</span>
                                <span>Reply</span>
                            </button>
                            <button 
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-slate-800"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(msg.content);
                                    setShowMenu(false);
                                }}
                            >
                                <span className="material-symbols-outlined text-base">content_copy</span>
                                <span>Copy Text</span>
                            </button>
                            
                             <button
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-slate-800"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteForMe();
                                }}
                            >
                                <span className="material-symbols-outlined text-base">delete</span>
                                <span>Delete for me</span>
                            </button>

                            {msg.user_id === user.id && (
                                <button
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-red-500 hover:bg-slate-800 rounded-b-2xl"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteForEveryone(msg);
                                        setShowMenu(false);
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base">delete_forever</span>
                                    <span>Delete for everyone</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
                </div>
                
                <div className={`text-[10px] mt-1 px-1 opacity-0 ${msg.status !== 'sending' ? 'group-hover:opacity-100' : ''} transition-opacity select-none ${isMe ? 'text-slate-500' : 'text-slate-500'}`}>
                    {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                </div>
            </div>
        </div>
    );
};

export default function MessageList({ messages, setMessages, currentUser, roomId, socket, onReply, onDelete }) {
    const { token } = useAuth();
    const [confirmDeleteMessage, setConfirmDeleteMessage] = useState(null);

    async function confirmDeleteForEveryone() {
        if (!confirmDeleteMessage) return;

        const msgId = confirmDeleteMessage.id;
        // 1) Close modal
        setConfirmDeleteMessage(null);

        // 2) Optimistically update local messages array
        setMessages(prev =>
            prev.map(m =>
                m.id === msgId
                    ? { ...m, is_deleted_for_everyone: true, content: "" }
                    : m
            )
        );

        try {
            // 3) Call API in the background
            await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${msgId}/for-everyone`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err) {
            console.error(err);
        }
    }
    const [showScrollButton, setShowScrollButton] = useState(false);
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);
    const shouldScrollToBottom = useRef(true);

    useEffect(() => {
        shouldScrollToBottom.current = true;
    }, [roomId]);

    useEffect(() => {
        if (!socket || !messages.length) return;
        const unseenIds = messages
            .filter(m => !m.isMe && m.status !== 'seen' && m.user_id !== currentUser.id && m.type !== 'system')
            .map(m => m.id);

        if (unseenIds.length > 0) {
            socket.emit('mark_seen', { roomId, messageIds: unseenIds });
        }
    }, [messages, socket, roomId, currentUser.id]);

    useEffect(() => {
        const div = scrollRef.current;
        if (!div) return;
        
        if (shouldScrollToBottom.current) {
            if (messages.length > 0) {
                bottomRef.current?.scrollIntoView({ behavior: 'auto' });
                shouldScrollToBottom.current = false;
            }
        } else {
            const isNearBottom = div.scrollHeight - div.scrollTop - div.clientHeight < 150;
            if (isNearBottom) {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, [messages]);

    const handleScroll = () => {
        const div = scrollRef.current;
        if (!div) return;
        const distanceToBottom = div.scrollHeight - div.scrollTop - div.clientHeight;
        setShowScrollButton(distanceToBottom > 100);
    };

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        setShowScrollButton(false);
    };

    return (
        <div className="flex-1 relative min-h-0 group/list">
            <div 
                ref={scrollRef}
                className="absolute inset-0 overflow-y-auto p-6 space-y-6 custom-scrollbar z-0"
                onScroll={handleScroll}
            >
                {messages.map((msg, index) => {
                    const isMe = msg.user_id === currentUser.id;
                    const isSystem = msg.type === 'system';

                    if (isSystem) {
                        let icon = 'info';
                        let textColor = 'text-slate-400';

                        if (msg.content.includes('joined')) {
                            icon = 'login';
                            textColor = 'text-emerald-400';
                        } else if (msg.content.includes('left')) {
                            icon = 'logout'; 
                            textColor = 'text-amber-400';
                        } else if (msg.content.includes('removed')) {
                            icon = 'person_remove';
                            textColor = 'text-red-400';
                        }

                        return (
                            <div key={msg.id || index} className="flex justify-center my-6 group/system animate-slide-in-up">
                                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/40 border border-slate-800/50 backdrop-blur-sm transition-all hover:bg-slate-900/60 hover:border-slate-700">
                                    <span className={`material-symbols-outlined text-[16px] ${textColor}`}>
                                        {icon}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium">
                                        {msg.content}
                                    </span>
                                    <span className="text-[10px] text-slate-600 opacity-0 group-hover/system:opacity-100 transition-opacity ml-2">
                                        {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                                    </span>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <MessageItem 
                            key={msg.id || index} 
                            msg={msg} 
                            isMe={isMe} 
                            onReply={onReply} 
                            onDelete={onDelete}
                            onDeleteForEveryone={(msg) => setConfirmDeleteMessage(msg)}
                        />
                    );
                })}

                <div ref={bottomRef} />
            </div>

            <button
                onClick={scrollToBottom}
                className={`
                    absolute bottom-5 right-5 w-10 h-10 rounded-full bg-slate-900/80 backdrop-blur-sm 
                    border border-slate-700 shadow-lg shadow-black/50 text-slate-200 
                    flex items-center justify-center z-20 transition-all duration-300 ease-in-out
                    hover:bg-slate-800 hover:text-white hover:scale-110 active:scale-95
                    ${showScrollButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
                `}
            >
                <span className="material-symbols-outlined text-xl">arrow_downward</span>
            </button>
            {confirmDeleteMessage && (
                <div className="
                    fixed inset-0 z-50 flex items-center justify-center
                    bg-black/60
                ">
                    <div className="
                        bg-slate-900 rounded-2xl shadow-2xl
                        border border-slate-700
                        w-full max-w-sm px-6 py-5
                    ">
                        <h2 className="text-lg font-semibold text-slate-100 mb-2">
                            Delete message for everyone?
                        </h2>
                        <p className="text-sm text-slate-300 mb-6">
                            This message will be deleted for all participants in this chat.
                        </p>

                        <div className="flex justify-end gap-2">
                            <button
                                className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
                                onClick={() => setConfirmDeleteMessage(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-4 py-2 rounded-xl text-sm bg-red-500 text-white hover:bg-red-600"
                                onClick={() => confirmDeleteForEveryone()}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

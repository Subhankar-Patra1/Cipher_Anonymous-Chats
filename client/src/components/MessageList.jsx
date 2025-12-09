import { useEffect, useRef, useState } from 'react';
import { linkifyText } from '../utils/linkify';
import { useAuth } from '../context/AuthContext';
import AudioPlayer from './AudioPlayer';

const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const MessageItem = ({ msg, isMe, onReply, onDelete, onDeleteForEveryone, onRetry, onMarkHeard, onEdit, onImageLoad }) => { // [MODIFIED] Added onImageLoad
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);
    const { token, user } = useAuth(); 
    const isAudio = msg.type === 'audio';

    const toggleMenu = (e) => {
        e.stopPropagation();
        setShowMenu(prev => !prev);
    };

    // ... (rest of useEffects) ... 
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

    // ... (rest of functions) ...
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

    const handleDownload = (e) => {
        e.stopPropagation();
        if (msg.audio_url) {
            const a = document.createElement('a');
            a.href = msg.audio_url;
            a.download = `voice-note-${msg.id}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
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
            className={`flex ${isMe ? 'justify-end' : 'justify-start'} group max-w-full animate-slide-in-up ${showMenu ? 'z-[100] relative' : ''}`}
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
                        px-4 py-3 shadow-md text-sm leading-relaxed break-all relative overflow-hidden whitespace-pre-wrap
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
                                <div className="text-xs font-bold text-violet-300 mb-0.5 max-w-[200px] truncate">
                                    {msg.replyTo.sender}
                                </div>
                                
                                {msg.replyTo.type === 'audio' ? (
                                    <div className="flex items-center gap-1 text-xs opacity-90">
                                        <span className="material-symbols-outlined text-[14px]">mic</span>
                                        <span>Voice message • {formatDuration(msg.replyTo.audio_duration_ms)}</span>
                                    </div>
                                ) : msg.replyTo.type === 'gif' ? (
                                    <div className="flex items-center gap-1 text-xs opacity-90">
                                        <span className="material-symbols-outlined text-[14px]">gif</span>
                                        <span>GIF</span>
                                    </div>
                                ) : (
                                    <div className="text-xs opacity-80 line-clamp-2">
                                        {msg.replyTo.text}
                                    </div>
                                )}
                            </div>
                        )}

                        {isAudio ? (
                            <div className="pr-6 pt-1 pb-1 min-w-[200px]">
                                {msg.uploadStatus === 'uploading' ? (
                                    <div className="flex items-center gap-3 py-1">
                                         <div className="w-8 h-8 rounded-full bg-slate-100/10 flex items-center justify-center">
                                            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
                                         </div>
                                         <div className="flex flex-col">
                                             <span className="text-xs font-medium opacity-90">Uploading...</span>
                                             <span className="text-[10px] opacity-60">
                                                 {Math.round((msg.uploadProgress || 0) * 100)}%
                                             </span>
                                         </div>
                                    </div>
                                ) : msg.uploadStatus === 'failed' ? (
                                    <div className="flex items-center gap-3 py-1 text-red-100">
                                         <button 
                                            onClick={() => onRetry(msg)}
                                            className="w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center transition-colors"
                                         >
                                            <span className="material-symbols-outlined text-[20px]">refresh</span>
                                         </button>
                                         <span className="text-xs font-medium">Upload failed</span>
                                    </div>
                                ) : (
                                    <AudioPlayer 
                                        src={msg.audio_url} 
                                        durationMs={msg.audio_duration_ms} 
                                        waveform={msg.audio_waveform} 
                                        isMe={isMe}
                                        isHeard={msg.audio_heard}
                                        onMarkHeard={() => onMarkHeard(msg.id)}
                                    />
                                )}
                            </div>
                        ) : msg.type === 'gif' ? (
                            <>
                            <div className="relative group/gif mt-1 mb-1 max-w-[200px] sm:max-w-[300px]">
                                {msg.gif_url && msg.gif_url.endsWith('.mp4') ? (
                                    <video 
                                        src={msg.gif_url} 
                                        className="w-full h-auto object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                        autoPlay 
                                        muted 
                                        loop 
                                        playsInline
                                        onLoadedData={onImageLoad} // [NEW] Trigger scroll check on video load
                                        onClick={() => window.open(msg.gif_url, '_blank')}
                                    />
                                ) : (
                                    <img 
                                        src={msg.preview_url || msg.gif_url} 
                                        alt="GIF" 
                                        className="w-full h-auto object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                        loading="lazy"
                                        onLoad={onImageLoad} // [NEW] Trigger scroll check on image load
                                        onClick={() => window.open(msg.gif_url, '_blank')}
                                        title="Open full size"
                                    />
                                )}
                                {/* Label for GIF type if needed, or just let it be visual */}
                                <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] px-1 rounded uppercase font-bold tracking-wider pointer-events-none">
                                    GIF
                                </div>
                            </div>
                            {msg.content && msg.content !== 'GIF' && (
                                <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                                    {linkifyText(msg.content)}
                                </p>
                            )}
                            </>
                        ) : (
                            <p className="pr-10">
                                {linkifyText(msg.content)}
                                {msg.edited_at && (
                                    <span className="text-[10px] opacity-60 ml-1">(edited)</span>
                                )}
                            </p>
                        )}
                        
                        {isMe && (
                            <div className="absolute bottom-1 right-3 flex items-center gap-1 text-violet-200/80">
                                {msg.status === 'sending' && <span className="material-symbols-outlined text-[10px] animate-spin">progress_activity</span>}
                                {msg.status === 'error' && <span className="material-symbols-outlined text-[14px] text-red-300">error</span>}
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
                                z-[9999]
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
                                        text: snippet,
                                        type: msg.type,
                                        audio_duration_ms: msg.audio_duration_ms
                                    });
                                    setShowMenu(false);
                                }}
                            >
                                <span className="material-symbols-outlined text-base">reply</span>
                                <span>Reply</span>
                            </button>

                            {/* [NEW] Edit Option */}
                            {isMe && !isAudio && msg.type !== 'gif' && !msg.is_deleted_for_everyone && (
                                <button 
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-slate-800"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(msg);
                                        setShowMenu(false);
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base">edit</span>
                                    <span>Edit</span>
                                </button>
                            )}

                            {isAudio && msg.status !== 'error' ? (
                                <button 
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-slate-800"
                                    onClick={handleDownload}
                                >
                                    <span className="material-symbols-outlined text-base">download</span>
                                    <span>Download</span>
                                </button>
                            ) : null}

                            {msg.type === 'gif' && (
                                <button 
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-slate-800"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(msg.gif_url);
                                        setShowMenu(false);
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base">link</span>
                                    <span>Copy Link</span>
                                </button>
                            )}

                            {msg.type !== 'audio' && msg.type !== 'gif' && (
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
                            )}
                            
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

export default function MessageList({ messages, setMessages, currentUser, roomId, socket, onReply, onDelete, onRetry, onEdit }) { // [MODIFIED] Added onEdit
    const { token } = useAuth();
    const [confirmDeleteMessage, setConfirmDeleteMessage] = useState(null);

    const [showScrollButton, setShowScrollButton] = useState(false);
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);
    const shouldScrollToBottom = useRef(true);

    const handleMarkHeard = async (messageId) => {
        // Optimistic update
        setMessages(prev => prev.map(m => 
            m.id === messageId ? { ...m, audio_heard: true } : m
        ));

        // API call
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${messageId}/audio-heard`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err) {
            console.error(err);
        }
    };

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

    const handleImageLoad = () => {
        // When an image loads, if we should be at bottom (e.g. initial load) OR if we were already near bottom, scroll down.
        // We use a slightly larger threshold for "near bottom" here to account for multiple images content shift
        const div = scrollRef.current;
        if (!div) return;

        // If this is the initial load phase (shouldScrollToBottom is true), force it.
        // Or if user is already near the bottom.
        if (shouldScrollToBottom.current) {
             bottomRef.current?.scrollIntoView({ behavior: 'auto' });
             shouldScrollToBottom.current = false; // We can probably mark as done now
        } else {
            const distanceToBottom = div.scrollHeight - div.scrollTop - div.clientHeight;
             if (distanceToBottom < 500) { // Larger threshold for image loads
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
             }
        }
    };

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
                         // ... (keep system message logic)
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
                            onRetry={onRetry}
                            onMarkHeard={handleMarkHeard}
                            onEdit={onEdit} 
                            onImageLoad={handleImageLoad} // [NEW] Pass handleImageLoad
                        />
                    );
                })}

                <div ref={bottomRef} />
            </div>
            
            {/* ... (rest of scroll button and delete modal) ... */}
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

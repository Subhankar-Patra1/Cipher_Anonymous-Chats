import { useEffect, useRef, useState } from 'react';
import emojiRegex from 'emoji-regex';

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

export default function MessageList({ messages, currentUser, roomId, socket }) {
    const [showScrollButton, setShowScrollButton] = useState(false);
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);
    const shouldScrollToBottom = useRef(true);

    // Reset scroll flag when changing rooms
    useEffect(() => {
        shouldScrollToBottom.current = true;
    }, [roomId]);

    // Mark messages as seen
    useEffect(() => {
        if (!socket || !messages.length) return;

        const unseenIds = messages
            .filter(m => !m.isMe && m.status !== 'seen' && m.user_id !== currentUser.id && m.type !== 'system')
            .map(m => m.id);

        if (unseenIds.length > 0) {
            // Emit mark_seen event
            socket.emit('mark_seen', { roomId, messageIds: unseenIds });
            
            // Note: Optimistic update for 'seen' isn't strictly necessary if backend broadcasts update
            // But we could do it here if we wanted instant feedback.
            // For now rely on server broadcast 'messages_status_update' (handled in ChatWindow if implemented there, 
            // or we need to update messages prop from parent. 
            // Wait, MessageList receives messages from props. 
            // ChatWindow needs to handle 'messages_status_update' to update state.
            // I should add that listener to ChatWindow!)
        }
    }, [messages, socket, roomId, currentUser.id]);

    // Auto-scroll on new messages if near bottom or if it's the first load
    useEffect(() => {
        const div = scrollRef.current;
        if (!div) return;
        
        if (shouldScrollToBottom.current) {
            if (messages.length > 0) {
                bottomRef.current?.scrollIntoView({ behavior: 'auto' }); // 'auto' for instant jump on load
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

        // Show button if scrolled up more than 100px from bottom
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
                    const isSystem = msg.type === 'system'; // Future proofing

                    if (isSystem) {
                        let icon = 'info';
                        let textColor = 'text-slate-400';
                        let keyword = 'info';

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
                            <div key={msg.id || index} className="flex justify-center my-6 group/system">
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
                        <div key={msg.id || index} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group max-w-full`}>
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
                                
                                <div className={`
                                    px-4 py-3 shadow-md text-sm leading-relaxed break-words relative overflow-hidden whitespace-pre-wrap
                                    ${isMe 
                                        ? 'bg-violet-600 text-white rounded-2xl rounded-tr-sm' 
                                        : 'bg-slate-800 text-slate-200 rounded-2xl rounded-tl-sm border border-slate-700'
                                    }
                                `}>
                                    <p className="pr-10">
                                        {renderEmoji(msg.content)}
                                    </p>
                                    
                                    {/* Status Icon (Only for own messages) */}
                                    {isMe && (
                                        <div className="absolute bottom-1 right-3 flex items-center gap-1 text-violet-200/80">
                                            {msg.status === 'sending' && (
                                                <span className="material-symbols-outlined text-[10px] animate-spin">progress_activity</span>
                                            )}
                                            {msg.status === 'sent' && ( // Default DB status
                                                <span className="material-symbols-outlined text-[14px]">check</span>
                                            )}
                                            {msg.status === 'delivered' && ( // If we implement delivered
                                                <span className="material-symbols-outlined text-[14px]">check_circle</span> 
                                            )}
                                            {msg.status === 'seen' && (
                                                <span className="material-symbols-outlined text-[14px] text-white font-bold filled">done_all</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                <div className={`text-[10px] mt-1 px-1 opacity-0 ${msg.status !== 'sending' ? 'group-hover:opacity-100' : ''} transition-opacity select-none ${isMe ? 'text-slate-500' : 'text-slate-500'}`}>
                                    {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Scroll to Bottom Button */}
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
        </div>
    );
}

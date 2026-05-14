import React, { useEffect, useRef, useState, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { linkifyText } from '../utils/linkify';
import UnreadDivider from './UnreadDivider';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import AudioPlayer from './AudioPlayer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/atom-one-dark.css';
import 'katex/dist/katex.min.css';
import SparkleLogo from './icons/SparkleLogo';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import { formatBytes } from '../utils/formatBytes';
import ImageViewerModal from './ImageViewerModal';
import LocationMessage from './LocationMessage';
import PollMessage from './PollMessage';
import PollIcon from './icons/PollIcon';
import ViewOnceIcon from './icons/ViewOnceIcon';
import { NoMessages } from './EmptyState';
import { renderMusicPreviews, hasMusicLinks } from '../utils/musicLinkDetector';
import MessageInfoModal from './MessageInfoModal';
import BigAnimatedEmoji from './BigAnimatedEmoji'; // [NEW]
import { linkToBigEmoji, isSingleEmoji, splitEmojis } from '../utils/animatedEmojiMap'; // [NEW]
import emojiRegex from 'emoji-regex'; // [NEW] For spoiler emoji detection
import ReactionPicker, { REACTION_MAP } from './ReactionPicker'; // [NEW]
import ReactionDetailsModal from './ReactionDetailsModal'; // [NEW]
import TodoMessage from './TodoMessage';
import GroupInviteMessage from './GroupInviteMessage'; // [NEW]
import { Emoji, EmojiStyle } from 'emoji-picker-react';
import db, { updateLocalMessage } from '../utils/db';

// Helper to get unified code from any emoji
const getUnifiedFromEmoji = (emoji) => {
    // Check presest map first
    if (REACTION_MAP[emoji]) return REACTION_MAP[emoji];
    
    // Convert to unified code (handle surrogates/multi-char)
    try {
        return Array.from(emoji)
            .map(c => c.codePointAt(0).toString(16))
            .join('-');
    } catch (e) {
        return null;
    }
};

// Helper to detect if message is ONLY a spoiler containing 1-3 emojis
const isSpoilerOnlyEmojis = (content) => {
    if (!content) return false;
    // Check if content matches pattern: ||emojis|| with nothing else
    const spoilerMatch = content.trim().match(/^\|\|(.+?)\|\|$/);
    if (!spoilerMatch) return false;
    
    const spoilerContent = spoilerMatch[1].trim();
    const regex = emojiRegex();
    const matches = [...spoilerContent.matchAll(regex)];
    const emojiText = matches.map(m => m[0]).join('');
    
    // Check if spoiler content is ONLY 1-3 emojis
    return emojiText.length > 0 && spoilerContent.replace(regex, '').trim() === '' && matches.length <= 3;
};

const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatTime = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
};

const CodeBlock = ({ inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    const [isCopied, setIsCopied] = useState(false);
    const codeRef = useRef(null);

    const handleCopy = async () => {
        if (!codeRef.current) return;
        
        try {
            await navigator.clipboard.writeText(codeRef.current.textContent);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text:", err);
        }
    };

    return !inline && match ? (
        <div className="relative group/code my-4 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">
                    {match[1]}
                </span>
                <button 
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                    <span className="material-symbols-outlined text-[12px]">
                        {isCopied ? 'check' : 'content_copy'}
                    </span>
                    {isCopied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <div className="bg-[#282c34] overflow-x-auto text-sm">
                <code ref={codeRef} className={`${className} block p-4 font-mono text-white`} {...props}>
                    {children}
                </code>
            </div>
        </div>
    ) : (
        <code className={`${className} font-mono bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-[0.9em]`} {...props}>
            {children}
        </code>
    );
};


// [NEW] Helper for text contrast
const getContrastColor = (hexColor) => {
    if (!hexColor) return 'text-white';
    // Remove hash
    const hex = hexColor.replace('#', '');
    // Convert to RGB
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // YIQ equation
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? 'text-slate-900' : 'text-white';
};

export const MessageItem = ({ msg, isMe, onReply, onDelete, onDeleteForEveryone, onRetry, onRetryDecryption, onMarkHeard, onEdit, onImageLoad, onRegenerate, onPin, onStar, onUnstar, searchTerm, scrollToMessage, onImageClick, isSelectionMode, isSelected, onToggleSelection, onEnableSelectionMode, bubbleColor, onBottomInView, onViewInfo, isRestoreAnimation, animationDelay, onReact, onUnreact, onViewReactions, hasSkippedSync, onOpenProfile, activeReactionMessageId, setActiveReactionMessageId }) => { // [MODIFIED] Added lifted state props
 // [MODIFIED] Added onImageClick
    const [showMenu, setShowMenu] = useState(false);
    const [menuClosing, setMenuClosing] = useState(false); // [NEW] For close animation
    const [menuDirection, setMenuDirection] = useState('down'); // [NEW] Smart positioning
    const [menuStyle, setMenuStyle] = useState({}); // [NEW] For Portal positioning
    const [showFeedback, setShowFeedback] = useState(false); // [NEW] Feedback state
    const [viewingMessageInfo, setViewingMessageInfo] = useState(null); // [NEW] State for MessageInfoModal
    const showReactionPicker = activeReactionMessageId === msg.id; // [NEW] Derived from parent
    const [hasOverflow, setHasOverflow] = useState(false); // [NEW] For overflow hint
    const menuRef = useRef(null);
    const triggerRef = useRef(null); // [NEW] For portal positioning
    const reactionButtonRef = useRef(null); // [NEW] Add ref for reaction button
    
    // [NEW] Read More Logic
    const [isExpanded, setIsExpanded] = useState(false);
    const isLongMessage = useMemo(() => {
        if (!msg.content) return false;
        const CHAR_LIMIT = 450;
        const LINE_LIMIT = 10;
        const isLongText = msg.content.length > CHAR_LIMIT;
        const hasManyLines = (msg.content.match(/\n/g) || []).length > LINE_LIMIT;
        return isLongText || hasManyLines;
    }, [msg.content]);

    const { user, token } = useAuth(); 
    const isAudio = msg.type === 'audio';
    const [imgLoaded, setImgLoaded] = useState(false);
    const [isDownloaded, setIsDownloaded] = useState(() => {
        if (isMe) return true;
        try {
            const saved = JSON.parse(localStorage.getItem(`downloadedImages_${user?.id}`)) || [];
            return saved.includes(msg.id);
        } catch {
            return false;
        }
    });

    // [NEW] Listen for external download events (e.g., from SharedMedia)
    useEffect(() => {
        const handleExternalDownload = (e) => {
            if (e.detail && String(e.detail.messageId) === String(msg.id)) {
                setIsDownloaded(true);
            }
        };
        window.addEventListener('media:downloaded', handleExternalDownload);
        return () => window.removeEventListener('media:downloaded', handleExternalDownload);
    }, [msg.id]);

    const [isDownloading, setIsDownloading] = useState(false);

    const handleFileIconClick = (e) => {
        e.stopPropagation();
        if (isMe || isDownloaded || isDownloading) return;

        setIsDownloading(true);
        // Simulate network delay
        setTimeout(() => {
            markAsDownloaded(); // This updates localStorage and isDownloaded state
            setIsDownloading(false);
            
            // Dispatch event to sync with shared media if needed (though shared media reads from localStorage on mount/update)
            // But we should notify SharedMedia too if it's open.
            window.dispatchEvent(new CustomEvent('media:downloaded', { detail: { messageId: String(msg.id) } }));
        }, 1500);
    };

    const reactions = msg.reactions || [];
    const myReaction = reactions.find(r => parseInt(r.userId) === parseInt(user?.id))?.reaction;
    
    // Group reactions for display
    const reactionGroups = reactions.reduce((acc, r) => {
        const found = acc.find(g => g.emoji === r.reaction);
        if (found) {
            found.count++;
            if (parseInt(r.userId) === parseInt(user?.id)) found.isMe = true;
        } else {
            acc.push({ emoji: r.reaction, count: 1, isMe: parseInt(r.userId) === parseInt(user?.id) });
        }
        return acc;
    }, []);

    const linkClass = isMe 
        ? "text-white hover:text-slate-200 underline break-words decoration-violet-400 decoration-1 hover:decoration-2"
        : "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline break-words decoration-blue-300 dark:decoration-blue-500 decoration-1 hover:decoration-2";

    const markAsDownloaded = () => {
        setIsDownloaded(true);
        try {
             const key = `downloadedImages_${user?.id}`;
             const saved = JSON.parse(localStorage.getItem(key)) || [];
             if (!saved.includes(msg.id)) {
                 saved.push(msg.id);
                 localStorage.setItem(key, JSON.stringify(saved));
             }
        } catch (e) {
            console.error("Failed to save download state", e);
        }
    };

    // [NEW] Close menu with animation
    const closeMenu = () => {
        setMenuClosing(true);
        setTimeout(() => {
            setShowMenu(false);
            setMenuClosing(false);
        }, 150); // [MODIFIED] Faster collapse
        setHasOverflow(false); // Reset overflow hint
    };

    const toggleMenu = (e) => {
        e.stopPropagation();
        if (isSelectionMode) return; 
        if (showMenu) {
            closeMenu();
        } else {
            // [NEW] Calculate best direction and fixed position for Portal
            const rect = e.currentTarget.getBoundingClientRect();
            const viewportH = window.innerHeight;
            const viewportW = window.innerWidth;
            const menuWidth = 192; // w-48 = 12rem = 192px
            const menuMaxHeight = 480; // Natural max height for full menu
            
            const spaceBelow = viewportH - rect.bottom - 20;
            const spaceAbove = rect.top - 20;
            
            // Horizontal positioning
            let left = isMe ? rect.right - menuWidth : rect.left;
            if (left < 10) left = 10;
            if (left + menuWidth > viewportW - 10) left = viewportW - menuWidth - 10;

            // Logic: Only go DOWN if it fits COMPLETELY. Otherwise, pick the best side.
            let direction;
            if (spaceBelow >= menuMaxHeight) {
                direction = 'down';
            } else if (spaceAbove > spaceBelow) {
                direction = 'up';
            } else {
                direction = 'down';
            }

            let style = { left: `${left}px` };
            
            if (direction === 'up') {
                style.bottom = `${viewportH - rect.top + 2}px`;
                style.maxHeight = `${Math.max(200, spaceAbove)}px`;
                style.transformOrigin = isMe ? 'bottom right' : 'bottom left';
            } else {
                style.top = `${rect.bottom + 2}px`;
                style.maxHeight = `${Math.max(200, spaceBelow)}px`;
                style.transformOrigin = isMe ? 'top right' : 'top left';
            }
            
            setMenuDirection(direction);
            setMenuStyle(style);
            setShowMenu(true);
        }
    };

    // [NEW] Detect initial overflow for fade effect
    useLayoutEffect(() => {
        if (showMenu && menuRef.current) {
            const { scrollHeight, clientHeight } = menuRef.current;
            setHasOverflow(scrollHeight > clientHeight + 10);
        }
    }, [showMenu]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                closeMenu();
            }
        };

        const handleScroll = (event) => {
            if (showMenu && !menuClosing) {
                // Ignore scroll events from within the menu itself
                if (menuRef.current && menuRef.current.contains(event.target)) {
                    return;
                }
                closeMenu();
            }
        };

        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', handleScroll, true);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [showMenu, menuClosing]);

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

    // [NEW] View Once Open Status Logic
    const isViewOnceOpened = isMe 
        ? ((msg.viewed_by?.length || 0) >= ((msg.room_member_count || 2) - 1))
        : (msg.viewed_by?.includes(user?.id));

    // [NEW] Retry Decryption UI
    if (msg.content === '🔒 Waiting for this message...' || msg.content === '🔒 Decryption Failed') {
        // [NEW] Hide messages if user skipped sync (user doesn't want to see "Waiting for key" all over)
        if (hasSkippedSync) return null;

        const isRetrying = msg.isDecryptionRetrying;
        return (
            <div 
                id={`msg-${msg.id}`}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} group max-w-full my-1`}
            >
                <div 
                    className={`
                        max-w-[75%] rounded-2xl flex items-center gap-3
                        ${isMe 
                            ? `bg-violet-600 text-white ${(msg.type === 'image' || msg.type === 'video' || msg.type === 'gif') ? 'rounded-xl' : 'rounded-2xl'} rounded-tr-sm` 
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-gray-100 rounded-tl-sm border border-slate-200 dark:border-slate-700 shadow-sm'
                        }
                        ${(msg.type === 'image' || msg.type === 'video' || msg.type === 'gif') ? 'p-[2px]' : 'px-3 py-2'}
                    `}
                    style={isMe && bubbleColor ? { backgroundColor: bubbleColor, borderColor: 'transparent' } : {}}
                >
                    <div className="flex flex-col">
                        <span className="text-sm font-medium opacity-90">
                           Encrypted Message
                        </span>
                        <span className="text-xs opacity-75">
                            {msg.content === '🔒 Decryption Failed' ? 'Decryption failed' : 'Waiting for this message...'}
                        </span>
                    </div>
                    
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isRetrying && onRetryDecryption) onRetryDecryption(msg.id);
                        }}
                        disabled={isRetrying}
                        className={`
                            p-1.5 rounded-full transition-colors flex items-center justify-center
                            ${isMe 
                                ? 'hover:bg-white/20 text-white' 
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'
                            }
                        `}
                        title="Retry Decryption"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${isRetrying ? 'animate-spin' : ''}`}>
                            refresh
                        </span>
                        {/* {isRetrying && <span className="ml-1 text-xs">Retrying...</span>} */}
                    </button>
                </div>
            </div>
        );
    }
    
    if (msg.is_deleted_for_everyone) {
        return (
            <div 
                id={`msg-${msg.id}`}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} group max-w-full my-1`}
            >
                <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`
                         px-3 py-2 text-sm italic text-slate-600 dark:text-slate-400
                         ${isMe 
                             ? 'bg-slate-50 dark:bg-white/5 rounded-2xl rounded-tr-sm border border-slate-100 dark:border-white/10 shadow-sm' 
                             : 'bg-slate-50 dark:bg-white/5 rounded-2xl rounded-tl-sm border border-slate-100 dark:border-white/10 shadow-sm'
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

    const isAi = msg.user_id === 'ai-assistant' || msg.author_name === 'Assistant' || (msg.meta && msg.meta.ai) || msg.isStreaming;
    
    return (

        <div 
            id={`msg-${msg.id}`}
            className={`
                flex ${isMe ? 'justify-end' : 'justify-start'} group ${isSelectionMode ? 'w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)]' : 'max-w-full'} ${showMenu ? 'z-[100] relative' : ''}
                ${isSelectionMode ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors -mx-4 px-4 sm:-mx-6 sm:px-6 py-0.5' : ''}
                ${isRestoreAnimation 
                    ? `animate-in fade-in duration-700 fill-mode-backwards ${isMe ? 'slide-in-from-right-16' : 'slide-in-from-left-16'}` 
                    : ''}
                ${!isRestoreAnimation && isMe && (msg.status === 'sending' || msg.status === 'pending' || msg.tempId) ? 'animate-message-send' : ''}
            `}
            style={(isRestoreAnimation ? { animationDelay } : {})}
            onClick={(e) => {
                if (isSelectionMode) {
                    e.stopPropagation();
                    onToggleSelection(msg.id);
                }
            }}
        >
             {/* [NEW] Selection Checkbox */}
             {isSelectionMode && (
                <div className={`
                    flex items-center justify-center mr-3 shrink-0 animate-in slide-in-from-left-2 duration-200
                `}>
                    <div className={`
                        w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
                        ${isSelected 
                            ? 'bg-violet-600 border-violet-600' 
                            : 'border-slate-300 dark:border-slate-500 bg-transparent hover:border-slate-400 dark:hover:border-slate-400'
                        }
                    `}>
                        {isSelected && (
                            <span className="material-symbols-outlined text-[16px] text-white font-bold leading-none">check</span>
                        )}
                    </div>
                </div>
            )}
            <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {/* ... (Avatar logic remains same) ... */}
                {/* Feedback Popup */}
                {showFeedback && (
                    <div className="absolute top-full mt-2 left-0 z-50 animate-in fade-in slide-in-from-top-1 duration-300 pointer-events-none">
                        <div className="bg-slate-800/90 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-slate-700/50">
                            <span className="material-symbols-outlined text-[14px] text-green-400">check_circle</span>
                            Response sent
                        </div>
                    </div>
                )}
                
                {!isMe && (
                    <div className="flex items-center gap-2 mb-1 ml-1 select-none">
                        <div 
                            onClick={(e) => {
                                e.stopPropagation();
                                const isUnknown = !msg.display_name && !msg.username;
                                if (!isAi && !isUnknown && onOpenProfile) onOpenProfile(msg.user_id);
                            }}
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold overflow-hidden cursor-pointer hover:opacity-80 transition-opacity ${isAi ? 'bg-fuchsia-50 dark:bg-fuchsia-900/10 border border-fuchsia-100 dark:border-fuchsia-800/30' : (!msg.avatar_thumb_url ? 'bg-gradient-to-br from-indigo-500 to-violet-600' : 'bg-slate-200 dark:bg-slate-800')} 
                            ${(!msg.display_name && !msg.username) ? '!cursor-default hover:opacity-100' : ''}`}
                        >
                            {isAi ? (
                                <SparkleLogo className="w-3.5 h-3.5" />
                            ) : msg.avatar_thumb_url ? (
                                <img src={msg.avatar_thumb_url} alt={msg.display_name} className="w-full h-full object-cover" />
                            ) : (
                                (msg.display_name || msg.username || '?')[0].toUpperCase()
                            )}
                        </div>

                        <span 
                            onClick={(e) => {
                                e.stopPropagation();
                                const isUnknown = !msg.display_name && !msg.username;
                                if (!isAi && !isUnknown && onOpenProfile) onOpenProfile(msg.user_id);
                            }}
                            className={`text-xs font-medium cursor-pointer hover:underline transition-colors ${isAi ? 'text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-purple-600 font-bold' : 'text-slate-600 dark:text-slate-400'}
                            ${(!msg.display_name && !msg.username) ? '!cursor-default !no-underline' : ''}`}
                        >
                            {renderTextWithEmojis(isAi ? (msg.display_name && msg.display_name !== 'Assistant' ? msg.display_name : 'Sparkle AI') : (msg.display_name || msg.username || 'Unknown User'))}
                        </span>
                    </div>
                )}

                
                <div className="relative group">
                    <div className="relative w-fit max-w-full">
                    <div className={`
                        message-bubble
                        ${(msg.type === 'image' || msg.type === 'gif' || msg.type === 'location' || msg.type === 'group_invite' || ((linkToBigEmoji(msg.content) || isSingleEmoji(msg.content) || isSpoilerOnlyEmojis(msg.content)) && !msg.replyTo)) ? 'p-1' : (isAi ? 'px-4 py-2.5' : 'px-4 py-3')}
                        ${(((linkToBigEmoji(msg.content) || isSingleEmoji(msg.content) || isSpoilerOnlyEmojis(msg.content)) && !msg.replyTo) || msg.type === 'group_invite') ? 'bg-transparent shadow-none border-none !p-0' : 'shadow-md'} 
                        text-sm leading-relaxed break-all relative overflow-hidden
                        ${(((linkToBigEmoji(msg.content) || isSingleEmoji(msg.content) || isSpoilerOnlyEmojis(msg.content)) && !msg.replyTo) || msg.type === 'group_invite') 
                            ? '' // No background classes for Big Emoji or Spoiler Emoji
                            : isMe 
                                ? `bg-violet-600 border border-violet-500/50 ${(msg.type === 'gif') ? 'rounded-[10px]' : 'rounded-2xl rounded-tr-sm'} whitespace-pre-wrap` 
                                : isAi 
                                    ? `bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 ${(msg.type === 'gif') ? 'rounded-[10px]' : 'rounded-2xl rounded-tl-sm'} border border-purple-200 dark:border-purple-500/30 shadow-purple-500/5` 
                                    : `bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 ${(msg.type === 'gif') ? 'rounded-[10px]' : 'rounded-2xl rounded-tl-sm'} border border-slate-200 dark:border-slate-700 whitespace-pre-wrap`
                        }
                        ${isMe ? (bubbleColor ? getContrastColor(bubbleColor) : 'text-white') : ''}
                    `}
                    style={(isMe && bubbleColor && !(((linkToBigEmoji(msg.content) || isSingleEmoji(msg.content) || isSpoilerOnlyEmojis(msg.content)) && !msg.replyTo) || msg.type === 'group_invite')) ? { backgroundColor: bubbleColor, borderColor: 'transparent' } : {}}
                    >
                        {(msg.isSkeleton || (!msg.isDecrypted && msg.ciphertext && !msg.content && msg.type !== 'system')) ? (
                            <div className="py-1 flex items-center gap-2 opacity-80">
                                <span className="text-sm italic">Waiting for this message...</span>
                            </div>
                        ) : (
                            <>
                        {msg.replyTo && (
                             <div 
                                onClick={() => scrollToMessage(msg.replyTo.id)} 
                                className={`
                                    mb-1 p-2 rounded-lg cursor-pointer
                                    border-l-4 border-violet-400
                                    transition-colors hover:bg-black/10 dark:hover:bg-black/25
                                    ${isMe ? 'bg-black/10 dark:bg-black/15' : 'bg-slate-100 dark:bg-black/15'}
                                `}
                            >
                                <div className={`text-xs font-bold mb-0.5 max-w-[200px] truncate ${isMe ? 'text-violet-200' : 'text-violet-600 dark:text-violet-300'}`}>
                                    {renderTextWithEmojis(msg.replyTo.sender)}
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
                                ) : msg.replyTo.is_view_once ? (
                                    <div className="flex items-center gap-1 text-xs opacity-90">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 -ml-[1px]">
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
                                            <path d="M10.5 9L12 7.5V16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span>Photo</span>
                                    </div>
                                ) : msg.replyTo.type === 'image' ? (
                                    <div className="flex items-center gap-1 text-xs opacity-90">
                                        <span className="material-symbols-outlined text-[14px]">image</span>
                                        <span className="truncate">
                                            {msg.replyTo.attachments && msg.replyTo.attachments.length > 1 
                                                ? `${msg.replyTo.attachments.length} photos` 
                                                : (msg.replyTo.caption || "Photo")}
                                        </span>
                                    </div>
                                ) : msg.replyTo.type === 'file' ? (
                                    <div className="flex items-center gap-1 text-xs opacity-90">
                                        <span className="material-symbols-outlined text-[14px]">description</span>
                                        <span className="truncate">
                                            {msg.replyTo.file_name || "File"}
                                            {msg.replyTo.caption ? ` • ${msg.replyTo.caption}` : ''}
                                        </span>
                                    </div>
                                ) : msg.replyTo.type === 'location' ? (
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex items-center gap-1 text-xs opacity-90">
                                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                                            <span>Location</span>
                                        </div>
                                        {msg.replyTo.latitude && msg.replyTo.longitude && (
                                            <div className="w-10 h-10 rounded overflow-hidden shrink-0 border border-black/10 dark:border-white/10">
                                                <img 
                                                    src={`https://static-maps.yandex.ru/1.x/?lang=en-US&ll=${msg.replyTo.longitude},${msg.replyTo.latitude}&z=10&l=map&size=80,80&pt=${msg.replyTo.longitude},${msg.replyTo.latitude},pm2rdm`}
                                                    alt="Map"
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : msg.replyTo.type === 'poll' ? (
                                    <div className="flex items-center gap-1 text-xs opacity-90">
                                        <PollIcon className="w-[14px] h-[14px] shrink-0" />
                                        <span className="truncate">{renderTextWithEmojis(msg.replyTo.poll_question) || 'Poll'}</span>
                                    </div>
                                ) : msg.replyTo.type === 'todo' ? (
                                    <div className="flex items-center gap-1 text-xs opacity-90">
                                        <span className="material-symbols-outlined text-[14px]">checklist</span>
                                        <span className="truncate">Todo</span>
                                    </div>
                                ) : (
                                    <div className="text-xs opacity-80 line-clamp-2">
                                        {linkifyText(msg.replyTo.plaintext_content || msg.replyTo.text, '', isMe ? 'text-white/90 underline break-all' : 'text-violet-600 dark:text-violet-300 underline break-all', { disableBigEmoji: true })}
                                    </div>
                                )}
                            </div>
                        )}

                        {isAudio ? (
                            // ... (Audio rendering logic same)
                             <div className="pr-6 pt-1 pb-1 min-w-[200px] relative">
                                {msg.uploadStatus === 'uploading' ? (
                                    <div className="flex items-center gap-3 py-1">
                                         <div className="w-8 h-8 rounded-full bg-slate-100/10 flex items-center justify-center">
                                            <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>
                                         </div>
                                         <div className="flex flex-col">
                                             <span className="text-xs font-medium opacity-90">Uploading...</span>
                                             <span className="text-[10px] opacity-60">
                                                 {Math.round((msg.uploadProgress || 0) * 100)}%
                                             </span>
                                         </div>
                                    </div>
                                ) : msg.uploadStatus === 'failed' ? (
                                    <div className="flex items-center gap-3 py-1 text-red-500 dark:text-red-300">
                                         <button 
                                            onClick={() => onRetry(msg)}
                                            className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 flex items-center justify-center transition-colors"
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
                                {/* Overlay Status Icon for Audio */}
                                {isMe && (
                                    <div className="absolute bottom-1 right-1 flex items-center justify-center p-0.5 rounded-full bg-black/30 backdrop-blur-[1px] z-20">
                                        {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] text-white">access_time</span>}
                                        {msg.status === 'error' && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onRetry && onRetry(msg); }}
                                                className="flex items-center gap-0.5 hover:scale-110 transition-transform"
                                                title="Retry Upload"
                                            >
                                                <span className="material-symbols-outlined text-[14px] text-red-400">refresh</span>
                                            </button>
                                        )}
                                        {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">check</span>}
                                        {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">done_all</span>}
                                        {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-400 font-bold filled">done_all</span>}
                                    </div>
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
                                        onLoadedData={onImageLoad} 
                                        onClick={() => onImageClick(msg)}
                                    />
                                ) : (
                                    <img 
                                        src={msg.preview_url || msg.gif_url} 
                                        alt="GIF" 
                                        className="w-full h-auto object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                        loading="lazy"
                                        onLoad={onImageLoad} 
                                        onClick={() => onImageClick(msg)}
                                        title="Open full size"
                                    />
                                )}
                                    <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] px-1 rounded uppercase font-bold tracking-wider pointer-events-none">
                                        GIF
                                    </div>
                                    
                                    {/* Overlay Status Icon for GIF */}
                                    {isMe && (
                                        <div className="absolute bottom-1 right-[38px] flex items-center justify-center p-0.5 rounded-full bg-black/30 backdrop-blur-[1px] z-20">
                                            {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] text-white">access_time</span>}
                                            {msg.status === 'error' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onRetry && onRetry(msg); }}
                                                    className="flex items-center gap-0.5 hover:scale-110 transition-transform"
                                                    title="Retry Send"
                                                >
                                                    <span className="material-symbols-outlined text-[14px] text-red-400">refresh</span>
                                                </button>
                                            )}
                                            {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">check</span>}
                                            {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">done_all</span>}
                                            {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-400 font-bold filled">done_all</span>}
                                        </div>
                                    )}
                                </div>
                                {msg.content && msg.content !== 'GIF' && (
                                    <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                                        {linkifyText(msg.content, searchTerm, linkClass)}
                                    </p>
                                )}
                            </>
                        ) : msg.type === 'todo' ? (
                            <TodoMessage msg={msg} />
                        ) : msg.type === 'group_invite' ? (
                            <GroupInviteMessage msg={msg} isMe={isMe} token={token} />
                        ) : ((linkToBigEmoji(msg.content) || isSingleEmoji(msg.content)) && !msg.replyTo) ? (
                            // Big emoji display - render each emoji separately
                            <div className="p-2 flex gap-1 flex-wrap">
                                {splitEmojis(msg.content).map((emoji, idx) => (
                                    linkToBigEmoji(emoji) ? (
                                        <BigAnimatedEmoji 
                                            key={idx}
                                            url={linkToBigEmoji(emoji)} 
                                            alt={emoji} 
                                            size={splitEmojis(msg.content).length > 1 ? 96 : 128}
                                            autoPlay={true}
                                        />
                                    ) : (
                                        // Apple emoji image for ones without animation
                                        <img 
                                            key={idx}
                                            src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${Array.from(emoji).map(c => c.codePointAt(0).toString(16)).filter(hex => hex !== 'fe0f').join('-')}.png`}
                                            alt={emoji}
                                            className="select-none drop-shadow-md object-contain"
                                            style={{ 
                                                width: splitEmojis(msg.content).length > 1 ? '60px' : '80px',
                                                height: splitEmojis(msg.content).length > 1 ? '60px' : '80px',
                                                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))'
                                            }}
                                            draggable="false"
                                        />
                                    )
                                ))}
                            </div>
                        ) : (isSpoilerOnlyEmojis(msg.content) && !msg.replyTo) ? (
                            <div className="flex gap-1 flex-wrap justify-start">
                                {linkifyText(msg.content, searchTerm, linkClass)}
                            </div>
                        ) : msg.type === 'image' ? (
                            msg.is_view_once ? (
                                <div className="flex flex-col mt-1 mb-1 max-w-[280px] sm:max-w-[320px] min-w-[120px]">
                                    <div 
                                        className={`
                                            relative bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden w-full transition-all duration-200
                                            border border-slate-300 dark:border-slate-600
                                            flex items-center gap-3 p-3 cursor-pointer select-none
                                            ${(msg.viewed_by && msg.viewed_by.includes(user.id)) || (msg.user_id === user.id) ? 'opacity-60 grayscale' : 'hover:bg-slate-300 dark:hover:bg-slate-600'}
                                        `}
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            // Handling Download/Open logic
                                            if (msg.user_id === user.id) return; // Sender can't open
                                            
                                            if (!isDownloaded) {
                                                markAsDownloaded(); // Start download
                                                return;
                                            }
                                            
                                            if (!imgLoaded) return; // Still downloading
                                            
                                            if ((!msg.viewed_by || !msg.viewed_by.includes(user.id))) {
                                                onImageClick(msg); 
                                            }
                                        }}
                                    >
                                        {/* Hidden Preloader to track download state */}
                                        {isDownloaded && !imgLoaded && (
                                            <img 
                                                src={msg.image_url} 
                                                className="hidden" 
                                                onLoad={() => setImgLoaded(true)} 
                                                onError={() => setImgLoaded(true)} // Fallback
                                                loading="eager" 
                                                alt=""
                                            />
                                        )}

                                        <div className={`
                                            w-10 h-10 rounded-full flex items-center justify-center shrink-0
                                            ${(isViewOnceOpened) || (isMe && msg.viewed_by && msg.viewed_by.length > 0 && !isViewOnceOpened) // Keep "partial viewed" style? No, user wants distinct state.
                                              // Let's stick to: If Opened -> Grey. If Not Opened -> Blue/Indigo.
                                              // Wait, checking prompt: "sender device show opened [WHEN ALL SHOW]".
                                              // Implication: Before all show, it should look "Sent/Delivered" (Blue).
                                              // So strict check on isViewOnceOpened is correct for styling too.
                                                ? (isViewOnceOpened ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400')
                                                : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                                            }
                                        `}>
                                            {/* 1. UPLOADING (Sender) */}
                                            {(msg.status === 'sending' || msg.status === 'pending') ? (
                                                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                            ) 
                                            /* 2. DOWNLOADING (Receiver: Signed as downloaded but not loaded) */
                                            : (!isMe && isDownloaded && !imgLoaded) ? (
                                                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                            )
                                            /* 3. NOT DOWNLOADED (Receiver) */
                                            : (!isMe && !isDownloaded) ? (
                                                <span className="material-symbols-outlined text-[20px]">download</span>
                                            )
                                            /* 4. OPENED (Sender/Receiver) */
                                            : (isViewOnceOpened) ? (
                                                <ViewOnceIcon isOpened={true} className="w-6 h-6 text-slate-500 dark:text-slate-300" />
                                            ) 
                                            /* 5. UNOPENED / READY (1 Icon) */
                                            : (
                                                <ViewOnceIcon isOpened={false} className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                                            )}
                                        </div>
                                        
                                        <div className="flex flex-col">
                                            <span className={`text-sm font-bold ${(isViewOnceOpened) ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                                {/* Text Logic */}
                                                {(isViewOnceOpened) ? 'Opened' 
                                                 : (msg.status === 'sending' || msg.status === 'pending') ? 'Sending...' 
                                                 : (!isMe && isDownloaded && !imgLoaded) ? 'Downloading...' 
                                                 : (!isMe && !isDownloaded) ? 'Photo' // Or 'Tap to dwnld'
                                                 : 'Photo'
                                                }
                                            </span>
                                            {msg.is_view_once && (
                                                <span className="text-[10px] text-slate-600 dark:text-slate-500">
                                                    {(!isMe && !isDownloaded) ? ((msg.image_size ? formatBytes(msg.image_size) + ' • ' : '') + 'View once') : 'View once'}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Overlay Status Icon for View Once */}
                                        {isMe && !isViewOnceOpened && (
                                            <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center justify-center">
                                                {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] text-slate-500">access_time</span>}
                                                {msg.status === 'error' && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onRetry && onRetry(msg); }}
                                                        className="flex items-center gap-0.5 hover:scale-110 transition-transform"
                                                        title="Retry Upload"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px] text-red-400">refresh</span>
                                                    </button>
                                                )}
                                                {/* We don't show checks here because the 'Opened' state is the main indicator for View Once */}
                                                {/* But checking Whatsapp style: they show ticks until opened. */}
                                                {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] text-slate-400">check</span>}
                                                {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-slate-400">done_all</span>}
                                                {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-400 font-bold filled">done_all</span>}
                                            </div>
                                        )}
                                    </div>
                                    
                                     {msg.caption && !msg.is_view_once && (
                                        <p className="text-sm mt-1 mb-1 whitespace-pre-wrap break-words px-1 italic text-slate-500">
                                            {linkifyText(msg.caption, searchTerm, linkClass)}
                                        </p>
                                    )}
                                </div>
                            ) : (
                            // [NEW] Grid Layout Logic
                            (msg.attachments && msg.attachments.length > 1) ? (
                                <div className="flex flex-col mt-1 mb-1 w-[280px] sm:w-[320px]">
                                    <div className={`relative grid gap-0.5 rounded-lg overflow-hidden ${
                                        msg.attachments.length === 2 ? 'grid-cols-2' :
                                        msg.attachments.length === 3 ? 'grid-cols-2' :
                                        'grid-cols-2'
                                    }`}
                                    >
                                        {msg.attachments.slice(0, 4).map((att, index) => {
                                            // Layout specific styles for 3 images
                                            // If 3 images: Index 0 spans 2 cols?
                                            const isThree = msg.attachments.length === 3;
                                            const span = (isThree && index === 0) ? 'col-span-2' : '';
                                            
                                            return (
                                            <div 
                                                key={index}
                                                className={`relative group/image overflow-hidden w-full h-full aspect-square ${span} cursor-pointer hover:opacity-95 transition-opacity bg-slate-200 dark:bg-slate-700`}
                                                onClick={(e) => { e.stopPropagation(); onImageClick(msg, index); }}
                                            >
                                                <img 
                                                    src={att.url} 
                                                    alt={msg.caption || "Image"} 
                                                    className="w-full h-full object-cover" 
                                                    loading="lazy" 
                                                />
                                                {/* +N Overlay for 4th item if more exist */}
                                                {index === 3 && msg.attachments.length > 4 && (
                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-bold backdrop-blur-[1px]">
                                                        +{msg.attachments.length - 4}
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })}
                                        
                                        {/* Upload Spinner Overlay for Grid */}
                                        {(msg.status === 'sending' || msg.status === 'pending') && (
                                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center transition-all duration-300 z-10 pointer-events-none">
                                                {(msg.uploadProgress || 0) < 1 ? (
                                                    <div className="relative w-10 h-10">
                                                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                                            <path
                                                                className="text-white/20"
                                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="4"
                                                            />
                                                            <path
                                                                className="text-white drop-shadow-md transition-all duration-200 ease-out"
                                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="4"
                                                                strokeDasharray={`${Math.round((msg.uploadProgress || 0) * 100)}, 100`}
                                                            />
                                                        </svg>
                                                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white shadow-black/50 drop-shadow-sm">
                                                            {Math.round((msg.uploadProgress || 0) * 100)}%
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 animate-in fade-in duration-300">
                                                        <div className="w-8 h-8 rounded-full border-[3px] border-white/30 border-t-white animate-spin shadow-lg"></div>
                                                        <span className="text-[10px] font-bold text-white shadow-black/50">Processing</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Overlay Status Icon for Grid */}
                                        {isMe && (
                                            <div className="absolute bottom-1 right-1 flex items-center justify-center p-0.5 rounded-full bg-black/30 backdrop-blur-[1px] z-20">
                                                {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] text-white">access_time</span>}
                                                {msg.status === 'error' && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onRetry && onRetry(msg); }}
                                                        className="flex items-center gap-0.5 hover:scale-110 transition-transform"
                                                        title="Retry Upload"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px] text-red-400">refresh</span>
                                                    </button>
                                                )}
                                                {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] text-white">check</span>}
                                                {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-white">done_all</span>}
                                                {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-400 font-bold filled">done_all</span>}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Caption for Grid */}
                                    {msg.caption && (
                                        <p className="text-sm mt-1 mb-1 whitespace-pre-wrap break-words px-1">
                                            {linkifyText(msg.caption, searchTerm, linkClass)}
                                            {msg.edited_at && (
                                                <span className="text-[10px] opacity-60 ml-1">(edited)</span>
                                            )}
                                        </p>
                                    )}
                                </div>
                            ) : (
                            <div className="flex flex-col max-w-[280px] sm:max-w-[320px] min-w-[120px]">
                                <div 
                                    className={`relative group/image bg-slate-200 dark:bg-slate-700 rounded-[10px] ${isMe ? 'rounded-tr-[2px]' : 'rounded-tl-[2px]'} overflow-hidden transition-all duration-200`}
                                    style={(() => {
                                        const originalW = msg.image_width || msg.attachments?.[0]?.width;
                                        const originalH = msg.image_height || msg.attachments?.[0]?.height;
                                        
                                        if (!originalW || !originalH) {
                                            return { width: '100%', aspectRatio: '1/1', maxWidth: '320px' };
                                        }

                                        const maxW = 320;
                                        const maxH = 450; // WhatsApp style max height
                                        let renderW = originalW;
                                        let renderH = originalH;

                                        // Scale down to fit Width first
                                        if (renderW > maxW) {
                                            const scale = maxW / renderW;
                                            renderW = maxW;
                                            renderH = renderH * scale;
                                        }

                                        // Then check Height constraint
                                        if (renderH > maxH) {
                                            const scale = maxH / renderH;
                                            renderH = maxH;
                                            renderW = renderW * scale;
                                        }

                                        return {
                                            width: `${renderW}px`,
                                            height: `${renderH}px`,
                                        };
                                    })()}
                                >
                                    {(isDownloaded || isMe || msg.preview_url || msg.image_url) && (
                                        <img 
                                            src={isDownloaded ? msg.image_url : (msg.preview_url || msg.gif_url || '')} 
                                            alt={msg.caption || "Image"} 
                                            className={`w-full h-full object-cover cursor-pointer transition-opacity duration-300 display-block ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                                            loading="eager" 
                                            decoding="async"
                                            onLoad={() => {
                                                setImgLoaded(true);
                                                onImageLoad && onImageLoad();
                                            }}
                                            onClick={(e) => { e.stopPropagation(); onImageClick(msg); }}
                                        />
                                    )}
                                    {/* Download Icon Overlay (Receiver only) */}
                                    {!isMe && (!isDownloaded || !imgLoaded) && (
                                        <div className="absolute inset-0 flex items-center justify-center z-20 backdrop-blur-md bg-black/30 transition-all duration-300">
                                            {!isDownloaded ? (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        markAsDownloaded();
                                                    }}
                                                    className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white border border-white/20 shadow-lg transition-transform active:scale-95 group/btn"
                                                    title="Download Image"
                                                >
                                                    <span className="material-symbols-outlined text-[24px] group-hover/btn:scale-110 transition-transform">download</span>
                                                </button>
                                            ) : (
                                                 <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin shadow-lg"></div>
                                            )}
                                            
                                            {!isDownloaded && (
                                                <span className="absolute bottom-4 text-xs font-medium text-white/90 drop-shadow-md">
                                                    {formatBytes(msg.image_size || 0)}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Corner Download Icon (for already downloaded images) */}
                                    {!isMe && isDownloaded && (
                                        <button 
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                    // Fetch image as blob
                                                    const response = await fetch(msg.image_url, {
                                                        mode: 'cors',
                                                        credentials: 'omit'
                                                    });
                                                    const blob = await response.blob();
                                                    
                                                    // Determine extension
                                                    const extension = blob.type.includes('png') ? 'png' : 
                                                                     blob.type.includes('gif') ? 'gif' : 
                                                                     blob.type.includes('webp') ? 'webp' : 'jpg';
                                                    
                                                    // Create blob URL and download
                                                    const blobUrl = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = blobUrl;
                                                    a.download = `image-${msg.id}.${extension}`;
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    document.body.removeChild(a);
                                                    URL.revokeObjectURL(blobUrl);
                                                } catch (err) {
                                                    console.error('Download failed:', err);
                                                }
                                            }}
                                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-all duration-200 z-20 backdrop-blur-sm"
                                            title="Save to Device"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">download</span>
                                        </button>
                                    )}
                                    {/* Overlay Status Icon */}
                                    {isMe && (
                                        <div className="absolute bottom-1 right-1 flex items-center justify-center p-0.5 rounded-full bg-black/30 backdrop-blur-[1px] z-20">
                                            {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] text-white">access_time</span>}
                                            {msg.status === 'error' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onRetry && onRetry(msg); }}
                                                    className="flex items-center gap-0.5 hover:scale-110 transition-transform"
                                                    title="Retry Upload"
                                                >
                                                    <span className="material-symbols-outlined text-[14px] text-red-400">refresh</span>
                                                </button>
                                            )}
                                            {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] text-white">check</span>}
                                            {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-white">done_all</span>}
                                            {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-400 font-bold filled">done_all</span>}
                                        </div>
                                    )}

                                    {(msg.status === 'sending' || msg.status === 'pending') && (
                                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center transition-all duration-300 z-10">
                                            {(msg.uploadProgress || 0) < 1 ? (
                                                <div className="relative w-10 h-10">
                                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                                        <path
                                                            className="text-white/20"
                                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="4"
                                                        />
                                                        <path
                                                            className="text-white drop-shadow-md transition-all duration-200 ease-out"
                                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="4"
                                                            strokeDasharray={`${Math.round((msg.uploadProgress || 0) * 100)}, 100`}
                                                        />
                                                    </svg>
                                                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white shadow-black/50 drop-shadow-sm">
                                                        {Math.round((msg.uploadProgress || 0) * 100)}%
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 animate-in fade-in duration-300">
                                                    <div className="w-8 h-8 rounded-full border-[3px] border-white/30 border-t-white animate-spin shadow-lg"></div>
                                                    <span className="text-[10px] font-bold text-white shadow-black/50">Processing</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                    {msg.caption && !msg.is_view_once && (
                                        <p className="text-sm mt-1 mb-1 whitespace-pre-wrap break-words px-1">
                                            {linkifyText(msg.caption, searchTerm, linkClass)}
                                            {msg.edited_at && (
                                                <span className="text-[10px] opacity-60 ml-1">(edited)</span>
                                            )}
                                        </p>
                                    )}
                                </div>
                            ))) : msg.type === 'file' ? (
                                <div className="flex flex-col mt-1 mb-1 min-w-[200px] max-w-[300px] relative pb-0">
                                    <div 
                                        className="flex items-center gap-3"
                                    >
                                        <div 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isMe && !isDownloaded && !msg.isDownloadingLocal) {
                                                // Trigger local fake download
                                                // We'll use a temp state on the msg object or a local state logic?
                                                // Better to use a local state. We need to add 'isDownloading' state to MessageItem first.
                                                // Assuming we can't easily add state in this replace block without changing the whole component, 
                                                // but wait, I can modify the component start to add state.
                                                // Actually, let's just use the ref or assume I added the state. 
                                                // For now, let's just call a handler I'll define or inline it if I can access setters.
                                                // I need to add the state first. Using a separate replace for that.
                                                // This replacement is just for the render.
                                                // Wait, I should add the state and handler in a previous or separate step if I can't do it all at once.
                                                // Let's stick to targeting the download implementation.
                                                
                                                // Just calling the handler I will add.
                                                handleFileIconClick(e);
                                            }
                                        }}
                                        className={`
                                            w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative
                                            ${isMe ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}
                                            ${!isMe && !isDownloaded ? 'cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors' : ''}
                                        `}
                                    >
                                        <span className="material-symbols-outlined text-[24px]">
                                            {isDownloading ? ( // Need to add isDownloading state
                                                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                !isMe && !isDownloaded ? 'download' : (
                                                    msg.file_extension === 'pdf' ? 'picture_as_pdf' :
                                                    ['doc', 'docx'].includes(msg.file_extension) ? 'description' :
                                                    ['xls', 'xlsx', 'csv'].includes(msg.file_extension) ? 'table_view' :
                                                    ['ppt', 'pptx'].includes(msg.file_extension) ? 'slideshow' :
                                                    ['zip', 'rar'].includes(msg.file_extension) ? 'folder_zip' :
                                                    'draft'
                                                )
                                            )}
                                        </span>
                                    </div>
                                        
                                        <div className="flex flex-1 items-center justify-between min-w-0 gap-2">
                                            <div className="flex flex-col justify-center gap-0 min-w-0 flex-1">
                                                <span className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                                                    {msg.file_name}
                                                </span>
                                                <span className={`text-[10px] mt-0.5 ${isMe ? 'text-violet-200' : 'text-slate-400'}`}>
                                                    {formatBytes(msg.file_size)} • {msg.file_extension?.toUpperCase()}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 mb-3 shrink-0">
                                                {isDownloaded && ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mp3', 'wav', 'txt'].includes((msg.file_extension || "").toLowerCase().replace('.', '')) && msg.status !== 'sending' && (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            try {
                                                                const win = window.open('', '_blank');
                                                                if (win) win.document.write('Loading...');
                                                                
                                                                const response = await fetch(msg.file_url);
                                                                const blob = await response.blob();
                                                                const objectUrl = URL.createObjectURL(blob);
                                                                
                                                                if (win) win.location.href = objectUrl;
                                                                else window.open(objectUrl, '_blank');
                                                                
                                                                setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
                                                            } catch (err) {
                                                                console.error("Failed to open file:", err);
                                                                window.open(msg.file_url, '_blank');
                                                            }
                                                        }}
                                                        className={`
                                                            text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors uppercase tracking-wider h-6 flex items-center
                                                            ${isMe 
                                                                ? 'bg-white/20 hover:bg-white/30 text-white' 
                                                                : 'bg-violet-100 hover:bg-violet-200 text-violet-600 dark:bg-violet-900/40 dark:hover:bg-violet-900/60 dark:text-violet-300'}
                                                        `}
                                                    >
                                                        OPEN
                                                    </button>
                                                )}
                                                
                                                {msg.status !== 'sending' && (
                                                    <a 
                                                        href={msg.file_url} 
                                                        download={msg.file_name} 
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`
                                                            w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0
                                                            ${isMe 
                                                                ? 'hover:bg-white/20 text-violet-100' 
                                                                : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400'
                                                            }
                                                        `}
                                                        title="Download"
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            markAsDownloaded(); 
                                                        }} 
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">download</span>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {msg.caption && (
                                        <p className="text-sm mt-2 whitespace-pre-wrap break-words">
                                            {linkifyText(msg.caption, searchTerm, linkClass)}
                                        </p>
                                    )}
                                    {/* Overlay Status Icon for File */}
                                    {isMe && (
                                        <div className="absolute -bottom-1 -right-1 flex items-center justify-center z-20 drop-shadow-md">
                                            {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] text-violet-200/80">access_time</span>}
                                            {msg.status === 'error' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onRetry && onRetry(msg); }}
                                                    className="flex items-center gap-1 bg-red-500/80 hover:bg-red-500 rounded-full px-1.5 py-0.5 transition-colors"
                                                    title="Retry Upload"
                                                >
                                                    <span className="material-symbols-outlined text-[12px] text-white">refresh</span>
                                                    <span className="text-[9px] text-white font-medium">Retry</span>
                                                </button>
                                            )}
                                            {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">check</span>}
                                            {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">done_all</span>}
                                            {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-400 font-bold filled">done_all</span>}
                                        </div>
                                    )}


                                </div>
                            ) : msg.type === 'location' ? (
                                <div className="relative">
                                    <LocationMessage 
                                        latitude={parseFloat(msg.latitude)}
                                        longitude={parseFloat(msg.longitude)}
                                        address={msg.address}
                                        isMe={isMe}
                                    />
                                    {/* Overlay Status Icon for Location */}
                                    {isMe && (
                                        <div className="absolute bottom-1 right-1 flex items-center justify-center p-0.5 rounded-full bg-black/30 backdrop-blur-[1px] z-20">
                                            {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] text-white">access_time</span>}
                                            {msg.status === 'error' && <span className="material-symbols-outlined text-[14px] text-red-400">error</span>}
                                            {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">check</span>}
                                            {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">done_all</span>}
                                            {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-400 font-bold filled">done_all</span>}
                                        </div>
                                    )}
                                </div>
                            ) : msg.type === 'poll' && msg.poll ? (
                                <div className="relative">
                                    <PollMessage 
                                        poll={msg.poll}
                                        onVote={async (pollId, optionIds) => {
                                            const token = localStorage.getItem('token');
                                            const res = await fetch(
                                                `${import.meta.env.VITE_API_URL}/api/polls/${pollId}/vote`,
                                                {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        Authorization: `Bearer ${token}`
                                                    },
                                                    body: JSON.stringify({ optionIds })
                                                }
                                            );
                                            if (!res.ok) throw new Error('Vote failed');
                                        }}
                                        onClose={async (pollId) => {
                                            const token = localStorage.getItem('token');
                                            await fetch(
                                                `${import.meta.env.VITE_API_URL}/api/polls/${pollId}/close`,
                                                {
                                                    method: 'POST',
                                                    headers: { Authorization: `Bearer ${token}` }
                                                }
                                            );
                                        }}
                                        isMe={isMe}
                                    />
                                    {/* Overlay Status Icon for Poll */}
                                    {isMe && (
                                        <div className="absolute bottom-1 right-1 flex items-center justify-center p-0.5 rounded-full bg-black/30 backdrop-blur-[1px] z-20">
                                            {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] text-white">access_time</span>}
                                            {msg.status === 'error' && <span className="material-symbols-outlined text-[14px] text-red-400">error</span>}
                                            {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">check</span>}
                                            {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-violet-200/90">done_all</span>}
                                            {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-400 font-bold filled">done_all</span>}
                                        </div>
                                    )}
                                </div>
                            ) : msg.type === 'call_log' ? (
                                <div className="flex items-center gap-3 py-2 px-1 min-w-[200px]">
                                    {/* Phone icon with hover glow */}
                                    <div 
                                        className={`
                                            w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 cursor-pointer
                                            ${isMe ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}
                                            hover:bg-green-500 dark:hover:bg-green-500 hover:text-white
                                        `}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const meta = JSON.parse(msg.caption || '{}');
                                            const iAmCaller = meta.caller_id ? meta.caller_id === user?.id : isMe;
                                            const callUserId = iAmCaller ? meta.target_id : (meta.caller_id || msg.user_id);
                                            if (callUserId) {
                                                window.dispatchEvent(new CustomEvent('cipher:initiate-call', { 
                                                    detail: { 
                                                        userId: callUserId,
                                                        roomId: msg.room_id,
                                                        type: meta.call_type || 'audio',
                                                        targetName: iAmCaller ? meta.target_name : (msg.display_name || msg.sender_name),
                                                        targetAvatar: iAmCaller ? meta.target_avatar : (msg.avatar_thumb_url || msg.sender_profile_pic)
                                                    } 
                                                }));
                                            }
                                        }}
                                        title="Click to call"
                                    >
                                        <span className="material-symbols-outlined text-[24px]">
                                            {JSON.parse(msg.caption || '{}').call_type === 'video' ? 'videocam' : 'call'}
                                        </span>
                                    </div>
                                    
                                    <div className="flex flex-col flex-1 min-w-0">
                                        {(() => {
                                            const meta = JSON.parse(msg.caption || '{}');
                                            const iAmCaller = meta.caller_id ? meta.caller_id === user?.id : isMe;
                                            const status = meta.call_status;
                                            
                                            let label = 'Call ended';
                                            let iconName = 'call_end';
                                            let iconColor = '';
                                            
                                            if (status === 'completed') {
                                                const dur = meta.duration;
                                                label = dur ? `Call ended · ${formatDuration(dur * 1000)}` : 'Call ended';
                                                iconName = iAmCaller ? 'call_made' : 'call_received';
                                                iconColor = 'text-green-400';
                                            } else if (status === 'missed') {
                                                label = iAmCaller ? 'No answer' : 'Missed call';
                                                iconName = iAmCaller ? 'call_made' : 'call_missed';
                                                iconColor = iAmCaller ? 'text-amber-400' : 'text-red-400';
                                            } else if (status === 'cancelled') {
                                                label = iAmCaller ? 'Cancelled' : 'Missed call';
                                                iconName = iAmCaller ? 'call_made' : 'call_missed';
                                                iconColor = iAmCaller ? 'text-amber-400' : 'text-red-400';
                                            } else if (status === 'declined') {
                                                label = iAmCaller ? 'Declined' : 'You declined';
                                                iconName = 'call_end';
                                                iconColor = 'text-red-400';
                                            } else if (status === 'busy') {
                                                label = 'Line busy';
                                                iconName = 'phone_disabled';
                                                iconColor = 'text-amber-400';
                                            } else if (status === 'initiated') {
                                                label = 'Outgoing call';
                                                iconName = 'call';
                                                iconColor = 'text-green-400';
                                            }
                                            
                                            return (
                                                <>
                                                    <span className={`text-sm font-medium ${isMe ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                                                        {meta.call_type === 'video' ? 'Video call' : 'Voice call'}
                                                    </span>
                                                    <div className="flex items-center gap-1 text-xs opacity-80">
                                                        <span className={`material-symbols-outlined text-[14px] ${iconColor}`}>{iconName}</span>
                                                        <span>{label}</span>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ) : msg.isSkeleton ? (
                                <div className="flex items-center gap-1.5 py-3 px-1 ml-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400/60 animate-dot-wave" />
                                    <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500/60 animate-dot-wave [animation-delay:0.2s]" />
                                    <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-600/60 animate-dot-wave [animation-delay:0.4s]" />
                                </div>
                            ) : (
                            <div className={`pr-2 ${!isMe && isAi ? 'markdown-content' : 'pr-6'}`}>
                                <div className={`
                                    ${!isExpanded && isLongMessage ? 'max-h-[300px] overflow-hidden relative' : ''}
                                    transition-all duration-200
                                `}>
                                    {!isExpanded && isLongMessage && (
                                         <div className={`absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t ${isMe ? 'from-violet-600' : (isAi ? 'from-white dark:from-slate-800' : 'from-white dark:from-slate-800')} to-transparent z-10 pointer-events-none`} />
                                    )}

                                    {isAi && !isMe ? (
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm, remarkMath]}
                                            rehypePlugins={[rehypeHighlight, rehypeKatex]}
                                            components={{
                                                code: CodeBlock
                                            }}
                                        >
                                            {/* [FIX] Pre-process API content: Replace literal <br> with newlines, and normalize math syntax */}
                                            {msg.content
                                                .replace(/<br\s*\/?>/gi, '\n')
                                                .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$') // \[...\] -> $$...$$
                                                .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')     // \(...\) -> $...$
                                            }
                                        </ReactMarkdown>
                                    ) : (
                                         <>
                                            {linkifyText(msg.content, searchTerm, linkClass)}
                                            {msg.edited_at && (
                                                <span className="text-[10px] opacity-60 ml-1">(edited)</span>
                                            )}
                                            {/* Music Link Previews */}
                                            {hasMusicLinks(msg.content) && renderMusicPreviews(msg.content, isMe)}
                                         </>
                                    )}
                                </div>
                    
                                {msg.isStreaming && (
                                    <span className="inline-block w-1.5 h-4 bg-fuchsia-500 ml-0.5 align-middle animate-pulse rounded-full" />
                                )}

                                {isLongMessage && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                        className={`text-xs font-bold mt-1 hover:underline focus:outline-none ${isMe ? 'text-violet-200' : 'text-violet-500 dark:text-violet-400'}`}
                                    >
                                        {isExpanded ? 'Read less' : 'Read more'}
                                    </button>
                                )}
                            </div>
                        )}
                        </>
                        )}
                        
                        {/* [MODIFIED] Status Icons moved back inside bubble for text messages */}
                        {isMe && !['image', 'gif', 'file', 'audio', 'location', 'poll'].includes(msg.type) && (
                            <div className="absolute right-2 bottom-1 flex items-center gap-0.5">
                                {(msg.status === 'sending' || msg.status === 'pending') && <span className="material-symbols-outlined text-[14px] opacity-70">access_time</span>}
                                {msg.status === 'error' && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onRetry && onRetry(msg); }}
                                        className="hover:text-red-500 transition-colors"
                                        title="Retry"
                                    >
                                        <span className="material-symbols-outlined text-[14px] text-red-500">refresh</span>
                                    </button>
                                )}
                                {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px] opacity-70">check</span>}
                                {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] opacity-70">done_all</span>}
                                {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-blue-300 font-bold filled">done_all</span>}
                            </div>
                        )}
                    </div>

                <div className={`
                    absolute top-1/2 -translate-y-1/2
                    ${isMe ? 'right-full mr-2 flex-row-reverse' : 'left-full ml-2'}
                    z-10 flex items-center gap-1
                `}>
                    {/* [NEW] Reaction Picker Toggle */}
                    {(!msg.isStreaming && !msg.isSkeleton && !msg.is_deleted_for_everyone && msg.type !== 'system') && !isSelectionMode && (
                        <div className="relative">
                            <button
                                ref={reactionButtonRef}
                                type="button"
                                className={`
                                    ${activeReactionMessageId === msg.id ? 'opacity-100 text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800/50' : 'opacity-0 group-hover:opacity-100'}
                                    transition-opacity duration-150
                                    text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white
                                    w-7 h-7 flex items-center justify-center rounded-full
                                `}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id);
                                }}
                                title="Add reaction"
                            >
                                <span className="material-symbols-outlined text-[18px]">add_reaction</span>
                            </button>

                            {activeReactionMessageId === msg.id && (
                                <ReactionPicker
                                    className=""
                                    origin={isMe ? 'bottom-right' : 'bottom-left'}
                                    triggerRef={reactionButtonRef}
                                    currentReaction={myReaction}
                                    onSelect={(emoji) => {
                                        onReact(msg.id, emoji);
                                        // Optional: close on select? User might want to multi-react? 
                                        // Usually reaction picker closes on select.
                                    }}
                                    onRemove={() => {
                                        onUnreact(msg.id);
                                    }}
                                    onClose={() => {
                                        setActiveReactionMessageId(null);
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {(!msg.isStreaming && !msg.isSkeleton) && 
                      // Conditionally hide menu for Images/ViewOnce if:
                      // 1. Sender: Still sending
                      // 2. Receiver: Not downloaded yet (single image only, multi-image doesn't use imgLoaded)
                      !((msg.type === 'image' || msg.is_view_once) && (
                          (isMe && (msg.status === 'sending' || msg.status === 'pending')) || 
                          (!isMe && !msg.is_view_once && !(msg.attachments && msg.attachments.length > 1) && (!isDownloaded || !imgLoaded))
                      )) && !isSelectionMode && (
                        <div className="relative">
                            <button
                                ref={triggerRef}
                                type="button"
                                className={`
                                    ${showMenu ? 'opacity-100 text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800/50' : 'opacity-0 group-hover:opacity-100'}
                                    transition-opacity duration-150
                                    text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white
                                    w-7 h-7 flex items-center justify-center rounded-full
                                `}
                                onClick={toggleMenu}
                            >
                                <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                            </button>

                            {showMenu && createPortal(
                                <div
                                    ref={menuRef}
                                    className={`
                                        fixed
                                        w-48
                                        overflow-y-auto
                                        rounded-2xl
                                        bg-white dark:bg-[#232326]
                                        border border-slate-200 dark:border-slate-700/70
                                        shadow-2xl shadow-black/20 dark:shadow-black/60
                                        z-[9999]
                                        scrollbar-hide
                                        ${hasOverflow ? 'mask-fade-bottom' : ''}
                                        transition-all duration-[180ms] ease-out
                                        ${menuClosing 
                                            ? 'animate-[menuDieOut_150ms_ease-in] opacity-0' 
                                            : `opacity-100 scale-100 ${menuDirection === 'up' ? 'animate-[menuBornInUp_180ms_ease-out]' : 'animate-[menuBornIn_180ms_ease-out]'}`}
                                    `}
                                    style={menuStyle}
                                    onScroll={(e) => {
                                        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                                        setHasOverflow(scrollHeight - scrollTop > clientHeight + 10);
                                    }}
                                >
                                    {/* AI Regenerate */}
                                    {isAi && onRegenerate && (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRegenerate(msg.id);
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base">refresh</span>
                                            <span>Regenerate Response</span>
                                        </button>
                                    )}

                                    {/* Copy Option */}
                                    {msg.type !== 'call_log' && !msg.is_view_once && (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (msg.type === 'image') {
                                                    try {
                                                        const response = await fetch(msg.image_url, {
                                                            mode: 'cors',
                                                            credentials: 'omit',
                                                            cache: 'no-cache'
                                                        });
                                                        const originalBlob = await response.blob();
                                                        const imageBitmap = await createImageBitmap(originalBlob);
                                                        const canvas = document.createElement('canvas');
                                                        canvas.width = imageBitmap.width;
                                                        canvas.height = imageBitmap.height;
                                                        const ctx = canvas.getContext('2d');
                                                        ctx.drawImage(imageBitmap, 0, 0);
                                                        const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                                                        await navigator.clipboard.write([
                                                            new ClipboardItem({ 'image/png': pngBlob })
                                                        ]);
                                                    } catch (err) {
                                                        console.error('Failed to copy image:', err);
                                                        alert('Failed to copy image. ' + err.message);
                                                    }
                                                } else {
                                                    navigator.clipboard.writeText(msg.content);
                                                }
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base">content_copy</span>
                                            <span>{msg.type === 'image' ? 'Copy' : 'Copy Text'}</span>
                                        </button>
                                    )}

                                    {/* Reply Option */}
                                    {msg.type !== 'call_log' ? (
                                        !onRegenerate && msg.type !== 'group_invite' && (
                                            <button 
                                                className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
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
                                                        file_name: msg.file_name,
                                                        caption: msg.caption,
                                                        audio_duration_ms: msg.audio_duration_ms,
                                                        is_view_once: msg.is_view_once,
                                                        poll_question: msg.poll?.question,
                                                        latitude: msg.latitude,
                                                        longitude: msg.longitude,
                                                        address: msg.address,
                                                        attachments: msg.attachments,
                                                        todo: msg.todo
                                                    });
                                                    closeMenu();
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-base">reply</span>
                                                <span>Reply</span>
                                            </button>
                                        )
                                    ) : (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onReply({
                                                    id: msg.id,
                                                    sender: msg.display_name || msg.username,
                                                    text: msg.content || (JSON.parse(msg.caption || '{}').call_type === 'video' ? 'Video call' : 'Voice call'),
                                                    type: msg.type
                                                });
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base">reply</span>
                                            <span>Reply</span>
                                        </button>
                                    )}

                                    {/* AI Feedback */}
                                    {isAi && !isMe && msg.type !== 'call_log' && (
                                        <>
                                            <button 
                                                className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    closeMenu();
                                                    setShowFeedback(true);
                                                    setTimeout(() => setShowFeedback(false), 2000);
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-base">thumb_up</span>
                                                <span>Good response</span>
                                            </button>
                                            <button 
                                                className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    closeMenu();
                                                    setShowFeedback(true);
                                                    setTimeout(() => setShowFeedback(false), 2000);
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-base">thumb_down</span>
                                                <span>Bad response</span>
                                            </button>
                                        </>
                                    )}

                                    {/* Edit Option */}
                                    {isMe && msg.type !== 'call_log' && !isAudio && msg.type !== 'gif' && msg.type !== 'file' && msg.type !== 'location' && msg.type !== 'poll' && msg.type !== 'todo' && msg.type !== 'group_invite' && !msg.is_deleted_for_everyone && (msg.type !== 'image' || msg.caption) && (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit(msg);
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base">edit</span>
                                            <span>Edit</span>
                                        </button>
                                    )}

                                    {/* Audio Download */}
                                    {isAudio && msg.status !== 'error' && (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={handleDownload}
                                        >
                                            <span className="material-symbols-outlined text-base">download</span>
                                            <span>Download</span>
                                        </button>
                                    )}

                                    {/* GIF Link */}
                                    {msg.type === 'gif' && (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(msg.gif_url);
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base">link</span>
                                            <span>Copy Link</span>
                                        </button>
                                    )}

                                    {/* Download All (Multi-image) */}
                                    {msg.type !== 'call_log' && (msg.attachments && msg.attachments.length > 1) && !isAi && !msg.is_view_once && (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                const fallbackDownload = async () => {
                                                    const blobs = await Promise.all(
                                                        msg.attachments.map(async (att) => {
                                                            const response = await fetch(att.url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
                                                            return response.blob();
                                                        })
                                                    );
                                                    blobs.forEach((blob, i) => {
                                                        const blobUrl = URL.createObjectURL(blob);
                                                        const extension = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('webp') ? 'webp' : 'jpg';
                                                        const link = document.createElement('a');
                                                        link.href = blobUrl;
                                                        link.download = `image_${i + 1}.${extension}`;
                                                        link.click();
                                                        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                                                    });
                                                };
                                                try {
                                                    if (typeof window.showDirectoryPicker === 'function') {
                                                        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
                                                        for (let i = 0; i < msg.attachments.length; i++) {
                                                            const att = msg.attachments[i];
                                                            const response = await fetch(att.url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
                                                            const blob = await response.blob();
                                                            const extension = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('webp') ? 'webp' : 'jpg';
                                                            const filename = `image_${i + 1}.${extension}`;
                                                            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                                                            const writable = await fileHandle.createWritable();
                                                            await writable.write(blob);
                                                            await writable.close();
                                                        }
                                                        alert(`Successfully downloaded ${msg.attachments.length} images!`);
                                                    } else {
                                                        await fallbackDownload();
                                                    }
                                                } catch (apiErr) {
                                                    if (apiErr.name !== 'AbortError') {
                                                        console.log('File System API failed, using fallback:', apiErr.message);
                                                        await fallbackDownload();
                                                    }
                                                }
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base">download</span>
                                            <span>Download All</span>
                                        </button>
                                    )}

                                    {/* Star Option */}
                                    {!isAi && !msg.is_deleted_for_everyone && !msg.is_view_once && (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (msg.is_starred) onUnstar(msg.id);
                                                else onStar(msg.id);
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base filled">
                                                {msg.is_starred ? 'star' : 'star_border'}
                                            </span>
                                            <span>{msg.is_starred ? 'Unstar' : 'Star'}</span>
                                        </button>
                                    )}

                                    {/* Pin Option */}
                                    {!isAi && onPin && !msg.is_deleted_for_everyone && !msg.is_view_once && (
                                        <button 
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPin(msg);
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base">{msg.is_pinned ? 'keep_off' : 'push_pin'}</span>
                                            <span>{msg.is_pinned ? 'Unpin' : 'Pin'}</span>
                                        </button>
                                    )}

                                    {/* Select Option */}
                                    <button
                                            className="menu-item first:rounded-t-2xl last:rounded-b-2xl"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEnableSelectionMode?.(msg.id);
                                                closeMenu();
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-base">check_circle</span>
                                            <span>Select</span>
                                        </button>

                                    {/* Delete Options */}
                                    <>
                                        {!isAi && (
                                            <button
                                                className="menu-item menu-item-danger first:rounded-t-2xl last:rounded-b-2xl"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteForMe();
                                                    closeMenu();
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-base">delete</span>
                                                <span>Delete for me</span>
                                            </button>
                                        )}

                                        {isAi && (
                                            <button
                                                className="menu-item menu-item-danger first:rounded-t-2xl last:rounded-b-2xl"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteForMe();
                                                    closeMenu();
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-base">delete</span>
                                                <span>Delete</span>
                                            </button>
                                        )}

                                        {msg.user_id === user.id && !isAi && (
                                            <button
                                                className="menu-item menu-item-danger first:rounded-t-2xl last:rounded-b-2xl"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteForEveryone(msg);
                                                    closeMenu();
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-base">delete_forever</span>
                                                <span>Delete for everyone</span>
                                            </button>
                                        )}
                                    </>
                                </div>,
                                document.body
                            )}
                        </div>
                    )}
                </div>
                </div>
                
                {/* [NEW] Combined Reaction Bubble */}
                {reactionGroups.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 animate-in fade-in zoom-in-95 duration-200 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                
                                const isGroup = msg.room_member_count > 2;
                                const allMembersReacted = reactions.length >= msg.room_member_count;
                                const hasMultipleEmojis = reactionGroups.length > 1;
                                const hasMultiplePeople = reactions.length > 1;

                                // If many people or types, show details. 
                                // In DM, if both reacted, show details.
                                if (hasMultipleEmojis || hasMultiplePeople || (isGroup && allMembersReacted)) {
                                    onViewReactions(msg, e.currentTarget.getBoundingClientRect());
                                } else {
                                    // Single reaction (1 type, 1 person)
                                    const group = reactionGroups[0];
                                    if (group.isMe) {
                                        onUnreact(msg.id);
                                    } else {
                                        onReact(msg.id, group.emoji);
                                    }
                                }
                            }}
                            className={`
                                flex items-center gap-1.5 rounded-full text-sm transition-all shadow-sm active:scale-90 px-2.5 py-1
                                ${reactionGroups.some(g => g.isMe) 
                                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200 border border-violet-200 dark:border-violet-700' 
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                }
                            `}
                        >
                            <div className="flex items-center gap-1">
                                {reactionGroups.map((group, i) => (
                                    <span 
                                        key={group.emoji} 
                                        className="scale-110 flex items-center justify-center"
                                        style={{ zIndex: reactionGroups.length - i }}
                                    >
                                        <Emoji 
                                            unified={getUnifiedFromEmoji(group.emoji)} 
                                            emojiStyle={EmojiStyle.APPLE} 
                                            size={16} 
                                        />
                                    </span>
                                ))}
                            </div>
                            {reactions.length > 1 && (
                                <span className="font-bold text-xs opacity-80 ml-0.5">{reactions.length}</span>
                            )}
                        </button>
                    </div>
                )}


                </div>
                
                
                <div className={`text-[10px] mt-1 px-1 flex items-center ${isMe ? 'justify-end' : 'justify-start text-slate-500'} gap-1 select-none transition-opacity ${
                    (msg.status === 'sending' || msg.status === 'pending' || msg.is_pinned || msg.is_starred) 
                        ? 'opacity-100 text-slate-600 dark:text-slate-300' 
                        : `opacity-0 group-hover:opacity-100 ${isMe ? 'text-slate-600 dark:text-slate-400' : 'text-slate-600 dark:text-slate-400'}`
                }`}>
                    {msg.is_starred && (
                        <span className="material-symbols-outlined text-[12px] filled text-amber-500 mr-0.5" title="Starred">star</span>
                    )}
                    {msg.is_pinned && (
                        <span className="material-symbols-outlined text-[12px] -rotate-45" title="Pinned">keep</span>
                    )}
                    {formatTime(msg.created_at)}
                </div>
            </div>
        </div>
    );
};



export default function MessageList({ 
    messages, 
    currentUser, 
    roomId, 
    socket, 
    onReply, 
    onDelete, 
    onRetry, 
    onRetryDecryption, 
    onEdit, 
    onRegenerate, 
    onPin, 
    searchTerm, 
    onLoadMore, 
    loadingMore, 
    hasMore, 
    isAiChat, 
    isSelectionMode, 
    selectedMessageIds, 
    onToggleMessageSelection, 
    onToggleSelectionMode,
    lastReadMessageId, // [NEW]
    onBottomInView, // [NEW]
    chatPreferences, // [NEW]
    onStar, // [NEW]
    onUnstar, // [NEW]
    onReact, // [NEW]
    onUnreact, // [NEW]
    isRestoreAnimation, // [NEW]
    hasSkippedSync, // [NEW]
    onOpenProfile // [NEW]
}) { // [MODIFIED] Added props // [MODIFIED] Added onPin
    const { token } = useAuth();
    const [confirmDeleteMessage, setConfirmDeleteMessage] = useState(null);

    // [NEW] Viewer State
    const [viewingImage, setViewingImage] = useState(null);
    const [viewingMessageInfo, setViewingMessageInfo] = useState(null); // [NEW] Info Modal State
    const [reactionMenu, setReactionMenu] = useState(null); // [NEW] { messageId, anchorRect }
    const [activeReactionMessageId, setActiveReactionMessageId] = useState(null); // [NEW] Mutually exclusive reaction picker

    const [showScrollButton, setShowScrollButton] = useState(false);
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);
    const shouldScrollToBottom = useRef(true);
    
    // [NEW] Smart Scroll - Scroll to divider on initial load (with timing fix for async Dexie)
    const hasInitialScrolledRef = useRef(false);
    const [newMessageCount, setNewMessageCount] = useState(0); // [NEW] Live message counter when scrolled up
    const [isScrolled, setIsScrolled] = useState(false); // [NEW] Track if initial scroll is done
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false); // [NEW] Delay empty state
    
    // Reset scroll flag and new message count when switching rooms
    useEffect(() => {
        hasInitialScrolledRef.current = false;
        setIsScrolled(false);
        setNewMessageCount(0);
        setIsInitialLoadComplete(false); // [NEW] Reset on room switch
        
        // [NEW] Delay showing empty state to allow hydration to complete
        const timer = setTimeout(() => {
            setIsInitialLoadComplete(true);
        }, 300); // 300ms delay to allow messages to load/hydrate
        
        return () => clearTimeout(timer);
    }, [roomId]);
    
    // [NEW] Pagination Refs
    const prevScrollHeightRef = useRef(0);
    const prevFirstMsgIdRef = useRef(null); 
    
    // We need to capture scrollHeight BEFORE render updates.
    // React doesn't give us "componentWillUpdate".
    // But we can use a ref to store current values, and check changes.
    React.useLayoutEffect(() => {
        const div = scrollRef.current;
        if (!div) return;

        const currentFirstMsgId = messages.length > 0 ? messages[0].id : null;
        const prevFirstMsgId = prevFirstMsgIdRef.current;
        
        if (currentFirstMsgId && prevFirstMsgId && currentFirstMsgId !== prevFirstMsgId) {
            // Check if we prepended (new id key is NOT the same)
            // Ideally we check timestamps.
            // But if id changed and we have more messages, likely prepend.
            if (messages.length > (div._prevMsgCount || 0)) {
                // Restore scroll
                const newHeight = div.scrollHeight;
                const diff = newHeight - prevScrollHeightRef.current;
                if (diff > 0) {
                    div.scrollTop = diff; // Jump to same visual position
                }
            }
        }
        
        // Save for next time
        prevScrollHeightRef.current = div.scrollHeight;
        prevFirstMsgIdRef.current = currentFirstMsgId;
        div._prevMsgCount = messages.length;
        
    }, [messages]);

    const handleMarkHeard = async (messageId) => {
        // [DEXIE] Optimistic update
        await updateLocalMessage(messageId, { audio_heard: true });

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

        // 2) [DEXIE] Optimistically update local message status
        await updateLocalMessage(msgId, { is_deleted_for_everyone: true, content: "" });

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

    const handleImageClick = async (msg, index = 0) => {
        // [NEW] View Once Logic
        if (msg.is_view_once) {
            // Check if already viewed (and we are not the sender? typically sender can't view either if it's strictly "view once" for receiver, but WhatsApp allows sender to see "Opened". Sender cannot view their own view-once photo usually to prevent them keeping a copy? Actually sender can't open it.)
            // Logic: If I am sender, I see "View Once" icon/status. I cannot open it.
            // If I am receiver:
            //   If viewed_by includes me: Show "Opened". (Handled in render)
            //   If NOT viewed_by includes me: Fetch and Show.
            
            if (msg.user_id === currentUser.id) return; // Sender cannot view
            if (msg.viewed_by && msg.viewed_by.includes(currentUser.id)) return; // Already viewed
            
            // [OPTIMIZED] Instant Open using cached URL
            // We use the same URL that was used for the hidden preloader (msg.image_url)
            // This ensures instant opening from browser cache.
            
            setViewingImage({
                 images: [{ src: msg.image_url, caption: msg.caption, isViewOnce: true, messageId: msg.id }],
                 startIndex: 0
            });

            // [DEXIE] Optimistically update local state to "Opened"
            await updateLocalMessage(msg.id, { 
                viewed_by: [...(msg.viewed_by || []), currentUser.id] 
            });

            // Call API in background to mark as viewed (burn it)
            // We don't wait for this to show the image.
            fetch(`${import.meta.env.VITE_API_URL}/api/messages/${msg.id}/view-once`, {
                headers: { Authorization: `Bearer ${token}` }
            }).catch(err => console.error("Failed to mark view once:", err));

            return;
        }

        if (msg.type === 'gif') {
            setViewingImage({
                 images: [{ src: msg.gif_url, caption: msg.content !== 'GIF' ? msg.content : '', messageId: msg.id }],
                 startIndex: 0
            });
            return;
        }

        // Collect all images from message
        let images = [];
        if (msg.attachments && msg.attachments.length > 0) {
            images = msg.attachments.map(a => ({ src: a.url, caption: msg.caption, messageId: msg.id }));
        } else {
            // Fallback
             images = [{ src: msg.image_url, caption: msg.caption, messageId: msg.id }];
        }

        setViewingImage({
            images,
            startIndex: index
        });
    };

    useEffect(() => {
        shouldScrollToBottom.current = true;
    }, [roomId]);

    useEffect(() => {
        if (!socket || !messages.length) return;
        const unseenIds = messages
            .filter(m => {
                const isAi = m.user_id === 'ai-assistant' || m.meta?.ai;
                return !m.isMe && 
                       !isAi && 
                       m.status !== 'seen' && 
                       String(m.user_id) !== String(currentUser.id) && 
                       m.type !== 'system';
            })
            .map(m => m.id);

        if (unseenIds.length > 0) {
            socket.emit('mark_seen', { roomId, messageIds: unseenIds });
        }
    }, [messages, socket, roomId, currentUser.id]);

    // [NEW] Track last message ID to detect REAL new messages at the bottom
    const prevLastMsgIdRef = useRef(null);

    // [NEW] Intersection Observer for Bottom Detection (Mark Read)
    useEffect(() => {
        if (!onBottomInView || !bottomRef.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    onBottomInView();
                }
            },
            { threshold: 0.1 } // Trigger when even a little bit of the bottom spacer is visible
        );

        observer.observe(bottomRef.current);
        return () => observer.disconnect();
    }, [onBottomInView]);

    // [NEW] Synchronous Initial Scroll - Prevents "Flash"
    useLayoutEffect(() => {
        if (hasInitialScrolledRef.current || messages.length === 0) return;

        // Ensure DOM is ready (useLayoutEffect runs after DOM mutation)
        const dividerElement = document.getElementById('unread-divider');
        if (dividerElement) {
            dividerElement.scrollIntoView({ block: 'center', behavior: 'auto' });
        } else {
            // Instant jump to bottom
            const div = scrollRef.current;
            if (div) {
                 div.scrollTop = div.scrollHeight;
            }
        }
        
        hasInitialScrolledRef.current = true;
        setIsScrolled(true);
        shouldScrollToBottom.current = false;
    }, [messages]);

    // [NEW] Handle Updates (New Messages)
    useEffect(() => {
        const div = scrollRef.current;
        if (!div) return;
        
        const lastMsg = messages[messages.length - 1];
        const isLastMsgMine = lastMsg && lastMsg.user_id === currentUser.id;
        const isNewMessageNodes = lastMsg && lastMsg.id !== prevLastMsgIdRef.current;

        // Increment new message count
        if (isNewMessageNodes && !isLastMsgMine && showScrollButton) {
            setNewMessageCount(prev => prev + 1);
        }

        // Update ref
        if (lastMsg) {
             prevLastMsgIdRef.current = lastMsg.id;
        }

        if (hasInitialScrolledRef.current) {
            // Standard update logic
            if (shouldScrollToBottom.current || (isLastMsgMine && isNewMessageNodes)) {
                if (messages.length > 0) {
                     // For updates, smooth scroll is fine, but 'auto' is snappier for self-sent
                     const behavior = shouldScrollToBottom.current ? 'auto' : 'smooth';
                     bottomRef.current?.scrollIntoView({ behavior });
                     shouldScrollToBottom.current = false;
                }
            } else {
                // If receiving others' messages, only scroll if we were already at bottom
                const isNearBottom = div.scrollHeight - div.scrollTop - div.clientHeight < 200;
                if (isNearBottom && isNewMessageNodes) {
                    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
            }
        }
    }, [messages, currentUser.id, showScrollButton]);

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

    // [NEW] Track unread mentions
    const [unreadMentionId, setUnreadMentionId] = useState(null);
    const lastSeenMsgIdRef = useRef(null);

    // [NEW] Check for new mentions when messages change
    useEffect(() => {
        if (!messages.length) return;
        
        const lastMsg = messages[messages.length - 1];
        const lastSeenId = lastSeenMsgIdRef.current;
        
        // Update ref for next run
        lastSeenMsgIdRef.current = lastMsg.id;

        // Find all NEW messages since last check
        let newMessages = [];
        if (lastSeenId) {
            const lastIndex = messages.findIndex(m => m.id === lastSeenId);
            if (lastIndex !== -1) {
                newMessages = messages.slice(lastIndex + 1);
            } else {
                // Determine heuristic: maybe all are new if lastSeenId not found (e.g. room change)
                newMessages = messages; 
            }
        } else {
            // First run or room switch, treat only latest batch as potentially new? 
            // Or mostly relying on scroll position. 
            // For now, let's just check the last few (heuristic) to cover the "initial load" case being ignored
            // strictly, we only want "arriving" messages.
            newMessages = [lastMsg]; 
        }

        // Find the LATEST mention in new messages
        // Filter out my own messages
        const mentions = newMessages.filter(m => 
            m.user_id !== currentUser.id && 
            m.content && 
            typeof m.content === 'string' && 
            m.content.includes(`(user:${currentUser.id})`)
        );

        if (mentions.length > 0) {
             const latestMention = mentions[mentions.length - 1];
             const div = scrollRef.current;
             const isAtBottom = div ? div.scrollHeight - div.scrollTop - div.clientHeight < 100 : true;
             
             if (!isAtBottom) {
                 setUnreadMentionId(latestMention.id);
             }
        }
    }, [messages, currentUser.id]);

    const handleScroll = () => {
        const div = scrollRef.current;
        if (!div) return;
        const distanceToBottom = div.scrollHeight - div.scrollTop - div.clientHeight;
        setShowScrollButton(distanceToBottom > 100);
        
        // [NEW] Reset new message count when user manually scrolls to bottom
        if (distanceToBottom < 50) {
            setNewMessageCount(0);
        }
        
        if (distanceToBottom < 100) {
            setUnreadMentionId(null);
        }

        // [NEW] Infinite Scroll Trigger
        if (div.scrollTop < 100 && hasMore && !loadingMore) {
            if (onLoadMore) onLoadMore();
        }
    };

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        setShowScrollButton(false);
        setUnreadMentionId(null);
        setNewMessageCount(0); // [NEW] Clear counter when clicking scroll button
    };

    const scrollToMessage = (id) => {
        const el = document.getElementById(`msg-${id}`);
        if (!el) return;

        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("reply-highlight");
        setTimeout(() => {
            el.classList.remove("reply-highlight");
        }, 2000);
    };

    const hasMessages = messages.filter(m => {
        const isDeletedForMe = Array.isArray(m.deleted_for_user_ids) && 
                               m.deleted_for_user_ids.includes(String(currentUser.id));
        return m.type !== 'poll_vote' && !isDeletedForMe;
    }).length > 0;

    // [NEW] Unread Divider Logic
    // 1. Sort messages chronologically (safety) with stable tie-breaker
    const sortedMessages = [...messages].sort((a, b) => {
        // [FIX] Ensure created_at is compared as dates, handle undefined/null
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        
        if (timeA !== timeB) {
            return timeA - timeB;
        }
        // Tie-breaker for identical timestamps (optimistic messages or clock skew)
        // Use localId (Dexie-assigned) or id (Server/UUID) or tempId
        const idA = a.localId || a.id || a.tempId || '';
        const idB = b.localId || b.id || b.tempId || '';
        return String(idA).localeCompare(String(idB));
    });

    // 2. Calculate Unread Count (Exclude own messages and system messages)
    // Only count messages strictly AFTER the lastReadMessageId
    const unreadMessages = sortedMessages.filter(m => 
        lastReadMessageId && // Only if we have a baseline
        (m.id > lastReadMessageId || (typeof m.id === 'string' && m.id.localeCompare(lastReadMessageId) > 0)) && // Handle potential string IDs (UUIDs vs Ints) - assuming numeric or comparable
        m.user_id !== currentUser.id &&
        m.type !== 'system'
    );
    const unreadCount = unreadMessages.length;

    // 3. Identify insertion point
    // We want the divider above the VERY FIRST message that is "unread" according to the ID check
    // visibleMessages is what we map over, so we need to match IDs there.
    const firstUnreadMsg = unreadMessages[0];
    const firstUnreadMsgId = firstUnreadMsg ? firstUnreadMsg.id : null;

    // [NEW] Exit Animation State
    const [exitingDivider, setExitingDivider] = useState(null); // { id, count }
    const prevUnreadStateRef = useRef({ id: null, count: 0 });

    useEffect(() => {
        const prev = prevUnreadStateRef.current;
        
        // If we had an ID, and now we don't (or it changed to null), trigger exit for the OLD one
        if (prev.id && !firstUnreadMsgId) {
             setExitingDivider({ id: prev.id, count: prev.count });
             const timer = setTimeout(() => {
                 setExitingDivider(null);
             }, 2000); // 2s Duration for vaporize effect
             return () => clearTimeout(timer);
        }
        
        // Update ref
        if (firstUnreadMsgId) {
            setExitingDivider(null); // Clear exit state if we have a new active one
            prevUnreadStateRef.current = { id: firstUnreadMsgId, count: unreadCount };
        } else {
            prevUnreadStateRef.current = { id: null, count: 0 };
        }
    }, [firstUnreadMsgId, unreadCount]);

    // Optimization: Filter unique visible messages once
    const visibleMessages = sortedMessages.filter(m => m.type !== 'poll_vote');

    return (
        <div 
            className="flex-1 relative min-h-0 group/list"
            onContextMenu={(e) => {
                if (isAiChat) {
                    e.preventDefault();
                }
            }}
        >
            {/* Doodle Background Pattern */}

            {/* Empty State - outside scroll container, only show after initial load delay */}
            {!hasMessages && isInitialLoadComplete && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <NoMessages />
                </div>
            )}

            {/* Scrollable Messages Container - only show when there are messages */}
            <div 
                ref={scrollRef}
                data-message-list
                className={`absolute inset-0 p-4 sm:p-6 space-y-1 sm:space-y-1.5 custom-scrollbar z-[1] transition-opacity duration-300 ${
                    hasMessages ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
                } ${isScrolled ? 'opacity-100' : 'opacity-0'}`}
                onScroll={handleScroll}
            >
                {loadingMore && (
                    <div className="flex justify-center py-4 animate-in fade-in zoom-in duration-300">
                         <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shadow-lg bg-white dark:bg-slate-800 p-1"></div>
                    </div>
                )}
                {viewingImage && (
                    <ImageViewerModal 
                        images={viewingImage.images}
                        startIndex={viewingImage.startIndex}
                        onClose={() => setViewingImage(null)}
                        onGoToMessage={scrollToMessage}
                    />
                )}

                {hasMessages && (
                    <>
                    {hasSkippedSync && (
                        <div className="flex flex-col items-center justify-center py-12 px-4 animate-in fade-in slide-in-from-top-4 duration-700">
                             <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-slate-400 text-3xl">lock_clock</span>
                             </div>
                             <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Chat History Hidden</h3>
                             <p className="text-sm text-slate-600 text-center max-w-xs mb-4">
                                 Previous messages are hidden. You can restore them anytime.
                             </p>
                             <button
                                onClick={() => {
                                    if (onOpenProfile) onOpenProfile(currentUser.id, null, true);
                                }}
                                className="text-violet-600 dark:text-violet-400 text-sm font-bold hover:underline"
                             >
                                 Go to Profile to Restore
                             </button>
                        </div>
                    )}
                    {visibleMessages.map((msg, index) => {
                    // [FIX] AI logic moved up for filtering
                    const isAi = msg.user_id === 'ai-assistant' || msg.author_name === 'Assistant' || (msg.meta && msg.meta.ai) || msg.isStreaming;
                    const isMe = msg.user_id == currentUser.id && !isAi;

                    // [NEW] Strict Hide for Skipped Sync
                    if (hasSkippedSync) {
                        // Allow AI Messages always (usually plaintext)
                        if (!isAi) {
                             // Check if it is SAFE to show:
                             // 1. Explicitly marked as Decrypted (e.g. newly sent local msg)
                             // 2. Explicitly marked as NOT Encrypted (e.g. system msg, public msg)
                             const isSafe = msg.isDecrypted || (msg.is_encrypted === false);
                             
                             if (!isSafe) return null; // Hide if not safe

                             // Double check for legacy placeholder text just in case flags are missing
                             if (!msg.content || msg.content === '🔒 Waiting for this message...' || msg.content === '🔒 Decryption Failed') return null;
                        }
                    }
                    const isSystem = msg.type === 'system';
                    
                    if (isSystem) {
                         // [FIX] If system message is deleted (e.g. unpinned), hide it completely
                         if (msg.is_deleted_for_everyone) return null;

                         // ... (keep system message logic)
                         let icon = 'info';
                         let textColor = 'text-slate-500 dark:text-slate-400';

                         if (msg.content.includes('joined')) {
                             icon = 'login';
                             textColor = 'text-emerald-500 dark:text-emerald-400';
                         } else if (msg.content.includes('left')) {
                             icon = 'logout'; 
                             textColor = 'text-amber-500 dark:text-amber-400';
                         } else if (msg.content.includes('removed') && !msg.content.includes('photo')) {
                             icon = 'person_remove';
                             textColor = 'text-red-500 dark:text-red-400';
                         } else if (msg.content.includes('changed the group name')) {
                             icon = 'edit';
                             textColor = 'text-blue-500 dark:text-blue-400';
                         } else if (msg.content.includes('changed the group description')) {
                             icon = 'description';
                             textColor = 'text-blue-500 dark:text-blue-400';
                         } else if (msg.content.includes('group photo')) {
                             icon = 'image';
                             textColor = 'text-blue-500 dark:text-blue-400';
                         } else if (msg.content.includes('updated group permissions')) {
                            icon = 'settings';
                            textColor = 'text-orange-500 dark:text-orange-400';
                         } else if (msg.content.includes('pinned a message')) {
                           icon = 'push_pin';
                           textColor = 'text-amber-600 dark:text-amber-400';
                        } else if (msg.content.includes('transferred ownership')) {
                           icon = 'admin_panel_settings';
                           textColor = 'text-purple-500 dark:text-purple-400';
                        }
 
                         return (
                            <React.Fragment key={msg.localId || msg.id || index}>
                                {(unreadCount > 0 && msg.id === firstUnreadMsgId) || (exitingDivider && msg.id === exitingDivider.id) ? (
                                     <UnreadDivider 
                                        id="unread-divider"
                                        count={unreadCount > 0 ? unreadCount : (exitingDivider?.count || 0)} 
                                        isExiting={!firstUnreadMsgId && !!exitingDivider}
                                     />
                                 ) : null}
                             <div className="flex justify-center my-6 group/system animate-slide-in-up">
                                 <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 dark:bg-[#232326]/40 border border-slate-200/50 dark:border-slate-800/50 backdrop-blur-sm transition-all hover:bg-white/80 dark:hover:bg-[#2A2A2D]/60 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm">
                                     <span className={`material-symbols-outlined text-[16px] ${textColor}`}>
                                         {icon}
                                     </span>
                                     <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                         {(() => {
                                             // Customize "User added" message if metadata exists
                                             if (msg.targetUserId && msg.actorId && msg.content.includes('added by')) {
                                                 if (String(msg.targetUserId) === String(currentUser.id)) {
                                                      return `You were added by ${msg.actorName || 'someone'}`;
                                                 }
                                             }
                                             if (msg.content.includes('pinned a message')) {
                                                 const name = msg.user_id === currentUser.id ? 'You' : (msg.display_name || 'Someone');
                                                 return renderTextWithEmojis(`${name} pinned a message`);
                                             }
                                             return linkifyText(msg.content, '', "text-blue-600 dark:text-blue-400 hover:underline");
                                         })()}
                                     </span>
                                     <span className="text-[10px] text-slate-500 dark:text-slate-600 opacity-0 group-hover/system:opacity-100 transition-opacity ml-2">
                                         {formatTime(msg.created_at)}
                                     </span>
                                     </div>
                             </div>
                            </React.Fragment>
                         );
                    }

                    return (
                        <React.Fragment key={msg.localId || msg.id || index}>
                            {(unreadCount > 0 && msg.id === firstUnreadMsgId) || (exitingDivider && msg.id === exitingDivider.id) ? (
                                    <UnreadDivider 
                                       id="unread-divider"
                                       count={unreadCount > 0 ? unreadCount : (exitingDivider?.count || 0)} 
                                       isExiting={!firstUnreadMsgId && !!exitingDivider}
                                    />
                                ) : null}

                        <MessageItem 
                            msg={msg} 
                            isMe={isMe} 
                            onReply={onReply} 
                            onDelete={onDelete}
                            onDeleteForEveryone={(msg) => setConfirmDeleteMessage(msg)}
                            onRetry={onRetry}
                            onRetryDecryption={onRetryDecryption}
                            onMarkHeard={handleMarkHeard}
                            onEdit={onEdit} 
                            onImageLoad={handleImageLoad}
                            onRegenerate={onRegenerate}
                            onPin={onPin}
                            searchTerm={searchTerm}
                            scrollToMessage={scrollToMessage}
                            onImageClick={handleImageClick}
                            token={token}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedMessageIds?.has(msg.id)}
                            onToggleSelection={onToggleMessageSelection}
                            onEnableSelectionMode={onToggleSelectionMode}
                            isInMultiSelect={isSelectionMode} // Assuming Prop adjustment if needed, else strict pass
                            bubbleColor={chatPreferences?.bubbleColor} // [NEW]
                            onViewInfo={(id) => setViewingMessageInfo(msg)} // [NEW] Info Modal - Pass Full Object
                            onBottomInView={onBottomInView} // [NEW]
                            onStar={onStar}
                            onUnstar={onUnstar}
                            // [NEW] Animation Props
                            isRestoreAnimation={isRestoreAnimation}
                            animationDelay={isRestoreAnimation ? `${index * 50}ms` : '0ms'}
                            onReact={onReact}
                            onUnreact={onUnreact}
                            onViewReactions={(m, rect) => setReactionMenu({ messageId: m.id, anchorRect: rect })} // [NEW]
                            hasSkippedSync={hasSkippedSync}
                            onOpenProfile={onOpenProfile}
                            // [NEW] Lifted State for Reaction Picker
                            activeReactionMessageId={activeReactionMessageId}
                            setActiveReactionMessageId={setActiveReactionMessageId}
                        />
                        </React.Fragment>
                    );
                })}
                </>
                )}

                <div ref={bottomRef} />
            </div>
            
            {/* ... (rest of scroll button and delete modal) ... */}
            {/* Unread Mention Button */}
            {unreadMentionId && showScrollButton && (
                <button
                    onClick={() => {
                        scrollToMessage(unreadMentionId);
                        setUnreadMentionId(null);
                    }}
                    className={`
                        absolute bottom-20 right-5 w-10 h-10 rounded-full bg-orange-500 text-white
                        border border-orange-400 shadow-lg shadow-orange-500/30 
                        flex items-center justify-center z-20 transition-all duration-300 ease-in-out
                        hover:bg-orange-600 hover:scale-110 active:scale-95
                    `}
                    title="New mention!"
                >
                    <span className="material-symbols-outlined text-xl">alternate_email</span>
                </button>
            )}

            <button
                onClick={scrollToBottom}
                className={`
                    absolute bottom-5 right-5 rounded-full bg-white/80 dark:bg-[#232326]/80 backdrop-blur-sm 
                    border border-slate-200 dark:border-slate-700 shadow-lg shadow-black/10 dark:shadow-black/50 text-slate-600 dark:text-slate-200 
                    flex items-center justify-center z-20 transition-all duration-300 ease-in-out
                    hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white hover:scale-110 active:scale-95
                    ${showScrollButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
                    ${newMessageCount > 0 ? 'px-3 py-2 gap-1.5' : 'w-10 h-10'}
                `}
            >
                {newMessageCount > 0 ? (
                    <>
                        <span className="material-symbols-outlined text-lg">arrow_downward</span>
                        <span className="text-xs font-bold">{newMessageCount}</span>
                    </>
                ) : (
                    <span className="material-symbols-outlined text-xl">arrow_downward</span>
                )}
            </button>
            {confirmDeleteMessage && (
                <div className="
                    fixed inset-0 z-50 flex items-center justify-center
                    bg-slate-950/60 backdrop-blur-sm
                ">
                    <div className="
                        bg-white dark:bg-[#232326] rounded-2xl shadow-2xl
                        border border-slate-200 dark:border-slate-700
                        w-full max-w-sm px-6 py-5
                        transition-colors
                    ">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
                            Delete message for everyone?
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-300 mb-6">
                            This message will be deleted for all participants in this chat.
                        </p>

                        <div className="flex justify-end gap-2">
                            <button
                                className="px-4 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                onClick={() => setConfirmDeleteMessage(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-4 py-2 rounded-xl text-sm bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                                onClick={() => confirmDeleteForEveryone()}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* [NEW] Message Info Modal */}
            {viewingMessageInfo && (
                <MessageInfoModal 
                    message={viewingMessageInfo} 
                    onClose={() => setViewingMessageInfo(null)}
                    socket={socket} // [NEW] Pass socket for real-time updates
                />
            )}

            {/* [NEW] Reaction Details Modal (Floating Menu) */}
            {reactionMenu && (
                <ReactionDetailsModal 
                    reactions={messages.find(m => m.id === reactionMenu.messageId)?.reactions || []}
                    anchorRect={reactionMenu.anchorRect}
                    onClose={() => setReactionMenu(null)}
                    onRemoveReaction={() => onUnreact(reactionMenu.messageId)}
                />
            )}
        </div>
    );
}

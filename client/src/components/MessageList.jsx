import React, { useEffect, useRef, useState } from 'react';
import { linkifyText } from '../utils/linkify';
import { useAuth } from '../context/AuthContext';
import AudioPlayer from './AudioPlayer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math'; // [NEW]
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex'; // [NEW]
import 'highlight.js/styles/atom-one-dark.css';
import 'katex/dist/katex.min.css'; // [NEW]
import SparkleLogo from './icons/SparkleLogo';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import { formatBytes } from '../utils/formatBytes';
import ImageViewerModal from './ImageViewerModal';
import LocationMessage from './LocationMessage';
import PollMessage from './PollMessage';
import PollIcon from './icons/PollIcon';
import { NoMessages } from './EmptyState';
import { renderMusicPreviews, hasMusicLinks } from '../utils/musicLinkDetector';

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
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
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


export const MessageItem = ({ msg, isMe, onReply, onDelete, onDeleteForEveryone, onRetry, onMarkHeard, onEdit, onImageLoad, onRegenerate, onPin, searchTerm, scrollToMessage, onImageClick, token }) => { // [MODIFIED] Added onPin
 // [MODIFIED] Added onImageClick
    const [showMenu, setShowMenu] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false); // [NEW] Feedback state
    const menuRef = useRef(null);
    const { user } = useAuth(); 
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
            // [NEW] Scroll into view when opened - with small delay for accuracy
            setTimeout(() => {
                if (menuRef.current) {
                    menuRef.current.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'nearest' 
                    });
                }
            }, 50);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMenu]);

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

    if (msg.is_deleted_for_everyone) {
        return (
            <div 
                id={`msg-${msg.id}`}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} group max-w-full my-1`}
            >
                <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`
                         px-3 py-2 text-sm italic text-slate-500 dark:text-slate-400
                         ${isMe 
                             ? 'bg-slate-100 dark:bg-slate-900/50 rounded-2xl rounded-tr-sm border border-slate-200 dark:border-slate-800' 
                             : 'bg-slate-100 dark:bg-slate-900/50 rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-800'
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
                flex ${isMe ? 'justify-end' : 'justify-start'} group max-w-full ${showMenu ? 'z-[100] relative' : ''}
            `}
        >
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
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold overflow-hidden ${isAi ? 'bg-fuchsia-50 dark:bg-fuchsia-900/10 border border-fuchsia-100 dark:border-fuchsia-800/30' : (!msg.avatar_thumb_url ? 'bg-gradient-to-br from-indigo-500 to-violet-600' : 'bg-slate-200 dark:bg-slate-800')}`}>
                            {isAi ? (
                                <SparkleLogo className="w-3.5 h-3.5" />
                            ) : msg.avatar_thumb_url ? (
                                <img src={msg.avatar_thumb_url} alt={msg.display_name} className="w-full h-full object-cover" />
                            ) : (
                                (msg.display_name || msg.username || '?')[0].toUpperCase()
                            )}
                        </div>

                        <span className={`text-xs font-medium transition-colors ${isAi ? 'text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-purple-600 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                            {renderTextWithEmojis(isAi ? (msg.display_name && msg.display_name !== 'Assistant' ? msg.display_name : 'Sparkle AI') : (msg.display_name || msg.username || 'Unknown User'))}
                        </span>
                    </div>
                )}

                
                <div className="relative group">
                    <div className={`
                        message-bubble
                        ${(msg.type === 'image' || msg.type === 'gif' || msg.type === 'location') ? 'p-1' : 'px-4 py-3'}
                        shadow-md text-sm leading-relaxed break-all relative overflow-hidden
                        ${isMe 
                            ? `bg-violet-600 text-white border border-violet-500/50 ${(msg.type === 'gif') ? 'rounded-[10px]' : 'rounded-2xl rounded-tr-sm'} whitespace-pre-wrap` 
                            : isAi 
                                ? `bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 ${(msg.type === 'gif') ? 'rounded-[10px]' : 'rounded-2xl rounded-tl-sm'} border border-purple-200 dark:border-purple-500/30 shadow-purple-500/5 min-w-[200px]` 
                                : `bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 ${(msg.type === 'gif') ? 'rounded-[10px]' : 'rounded-2xl rounded-tl-sm'} border border-slate-200 dark:border-slate-700 whitespace-pre-wrap`
                        }
                    `}>
                        {msg.isSkeleton ? (
                            <div className="flex gap-1 py-1">
                                <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-[bounce_1.4s_infinite_0ms]"></span>
                                <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-[bounce_1.4s_infinite_200ms]"></span>
                                <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-[bounce_1.4s_infinite_400ms]"></span>
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
                                ) : (
                                    <div className="text-xs opacity-80 line-clamp-2">
                                        {linkifyText(msg.replyTo.text, '', isMe ? 'text-white/90 underline break-all' : 'text-violet-600 dark:text-violet-300 underline break-all')}
                                    </div>
                                )}
                            </div>
                        )}

                        {isAudio ? (
                            // ... (Audio rendering logic same)
                             <div className="pr-6 pt-1 pb-1 min-w-[200px]">
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
                            </div>
                            {msg.content && msg.content !== 'GIF' && (
                                <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                                    {linkifyText(msg.content, searchTerm, linkClass)}
                                </p>
                            )}
                            </>
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
                                            {msg.status === 'sending' ? (
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
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-500 dark:text-slate-300">
                                                    <path d="M12 22A10 10 0 0 1 12 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                    <path d="M12 2A10 10 0 0 1 12 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
                                                </svg>
                                            ) 
                                            /* 5. UNOPENED / READY (1 Icon) */
                                            : (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-indigo-600 dark:text-indigo-400">
                                                     <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
                                                     <path d="M10.5 9L12 7.5V16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </div>
                                        
                                        <div className="flex flex-col">
                                            <span className={`text-sm font-bold ${(isViewOnceOpened) ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                                {/* Text Logic */}
                                                {(isViewOnceOpened) ? 'Opened' 
                                                 : (msg.status === 'sending') ? 'Sending...' 
                                                 : (!isMe && isDownloaded && !imgLoaded) ? 'Downloading...' 
                                                 : (!isMe && !isDownloaded) ? 'Photo' // Or 'Tap to dwnld'
                                                 : 'Photo'
                                                }
                                            </span>
                                            {msg.is_view_once && (
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                                    {(!isMe && !isDownloaded) ? ((msg.image_size ? formatBytes(msg.image_size) + ' • ' : '') + 'View once') : 'View once'}
                                                </span>
                                            )}
                                        </div>
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
                                        {msg.status === 'sending' && (
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
                            <div className="flex flex-col mt-1 mb-1 max-w-[280px] sm:max-w-[320px] min-w-[120px]">
                                <div 
                                    className="relative group/image bg-slate-200 dark:bg-slate-700 rounded-[6px] overflow-hidden transition-all duration-200"
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
                                    {msg.status === 'sending' && (
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
                                <div className="flex flex-col mt-1 mb-1 min-w-[200px] max-w-[300px]">
                                    <div 
                                        className="flex items-center gap-3"
                                    >
                                        <div className={`
                                            w-10 h-10 rounded-lg flex items-center justify-center shrink-0
                                            ${isMe ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300'}
                                        `}>
                                            <span className="material-symbols-outlined text-[24px]">
                                                {msg.file_extension === 'pdf' ? 'picture_as_pdf' :
                                                 ['doc', 'docx'].includes(msg.file_extension) ? 'description' :
                                                 ['xls', 'xlsx', 'csv'].includes(msg.file_extension) ? 'table_view' :
                                                 ['ppt', 'pptx'].includes(msg.file_extension) ? 'slideshow' :
                                                 ['zip', 'rar'].includes(msg.file_extension) ? 'folder_zip' :
                                                 'draft'
                                                }
                                            </span>
                                        </div>
                                        
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                                                {msg.file_name}
                                            </span>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className={`text-[10px] ${isMe ? 'text-violet-200' : 'text-slate-400'}`}>
                                                    {formatBytes(msg.file_size)} • {msg.file_extension?.toUpperCase()}
                                                </span>
                                                {msg.status === 'sending' ? (
                                                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />
                                                ) : (
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
                                                        onClick={(e) => e.stopPropagation()} 
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
                                </div>
                            ) : msg.type === 'location' ? (
                                <LocationMessage 
                                    latitude={parseFloat(msg.latitude)}
                                    longitude={parseFloat(msg.longitude)}
                                    address={msg.address}
                                    isMe={isMe}
                                />
                            ) : msg.type === 'poll' && msg.poll ? (
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
                            ) : (
                            <div className={`pr-2 ${!isMe && isAi ? 'markdown-content' : 'pr-6'}`}>
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
                    
                                {msg.isStreaming && (
                                    <span className="inline-block w-1.5 h-4 bg-fuchsia-500 ml-0.5 align-middle animate-pulse rounded-full" />
                                )}
                            </div>
                        )}
                        </>
                        )}
                        
                        {isMe && (
                            <div className="absolute bottom-0.5 right-1.5 flex items-center gap-1 text-violet-200/80 drop-shadow-md">
                                {msg.status === 'sending' && msg.type !== 'image' && <span className="material-symbols-outlined text-[10px] animate-spin">progress_activity</span>}
                                {msg.status === 'error' && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onRetry && onRetry(msg); }}
                                        className="hover:text-red-200 transition-colors"
                                        title="Retry Upload"
                                    >
                                        <span className="material-symbols-outlined text-[14px] text-red-300">refresh</span>
                                    </button>
                                )}
                                {msg.status === 'sent' && <span className="material-symbols-outlined text-[14px]">check</span>}
                                {msg.status === 'delivered' && <span className="material-symbols-outlined text-[14px] text-slate-300 dark:text-slate-400">done_all</span>}
                                {msg.status === 'seen' && <span className="material-symbols-outlined text-[14px] text-white font-bold filled">done_all</span>}
                            </div>
                        )}
                    </div>

                <div className={`
                    absolute top-1/2 -translate-y-1/2
                    ${isMe ? 'right-full mr-2' : 'left-full ml-2'}
                    z-10
                `}>
                    {(!msg.isStreaming && !msg.isSkeleton) && 
                      // Conditionally hide menu for Images/ViewOnce if:
                      // 1. Sender: Still sending
                      // 2. Receiver: Not downloaded yet (single image only, multi-image doesn't use imgLoaded)
                      !((msg.type === 'image' || msg.is_view_once) && (
                          (isMe && msg.status === 'sending') || 
                          (!isMe && !msg.is_view_once && !(msg.attachments && msg.attachments.length > 1) && (!isDownloaded || !imgLoaded))
                      )) && (
                        <button
                            type="button"
                            className={`
                                ${showMenu ? 'opacity-100 text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800/50' : 'opacity-0 group-hover:opacity-100'}
                                transition-opacity duration-150
                                text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white
                                w-7 h-7 flex items-center justify-center rounded-full
                            `}
                            onClick={toggleMenu}
                        >
                            ⋯
                        </button>
                    )}

                    {showMenu && (
                        <div
                            ref={menuRef}
                            className={`
                                absolute top-full mt-0.5
                                left-1/2 -translate-x-1/2 ${isMe ? '-ml-8' : 'ml-8'}
                                w-48
                                rounded-2xl
                                bg-white dark:bg-slate-900
                                border border-slate-200 dark:border-slate-700/70
                                shadow-2xl shadow-black/20 dark:shadow-black/60
                                py-1
                                z-[9999]
                            `}
                        >
                            {isAi && onRegenerate && (
                                <button 
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 first:rounded-t-2xl last:rounded-b-2xl transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRegenerate(msg.id);
                                        setShowMenu(false);
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base">refresh</span>
                                    <span>Regenerate Response</span>
                                </button>
                            )}

                            {isAi ? (
                                <>
                                    <button 
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
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
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Handle good feedback
                                            setShowMenu(false);
                                            setShowFeedback(true);
                                            setTimeout(() => setShowFeedback(false), 2000);
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-base">thumb_up</span>
                                        <span>Good response</span>
                                    </button>
                                    <button 
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Handle bad feedback
                                            setShowMenu(false);
                                            setShowFeedback(true);
                                            setTimeout(() => setShowFeedback(false), 2000);
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-base">thumb_down</span>
                                        <span>Bad response</span>
                                    </button>
                                </>
                            ) : (
                                !onRegenerate && (
                                <button 
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
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
                                            attachments: msg.attachments // [NEW] Pass attachments
                                        });
                                        setShowMenu(false);
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base">reply</span>
                                    <span>Reply</span>
                                </button>
                                )
                            )}

                            {/* [NEW] Edit Option */}
                            {isMe && !isAudio && msg.type !== 'gif' && msg.type !== 'file' && msg.type !== 'location' && msg.type !== 'poll' && !msg.is_deleted_for_everyone && (msg.type !== 'image' || msg.caption) && (
                                <button 
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
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
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                                    onClick={handleDownload}
                                >
                                    <span className="material-symbols-outlined text-base">download</span>
                                    <span>Download</span>
                                </button>
                            ) : null}

                            {msg.type === 'gif' && (
                                <button 
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
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

                            {msg.type !== 'audio' && msg.type !== 'gif' && msg.type !== 'file' && msg.type !== 'location' && msg.type !== 'poll' && !isAi && !msg.is_view_once && (
                                // Check if this is a multi-image message
                                (msg.attachments && msg.attachments.length > 1) ? (
                                    // Download All button for multi-image messages
                                    <button 
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            
                                            // Helper to trigger fallback download (all images to Downloads folder)
                                            const fallbackDownload = async () => {
                                                // Fetch all images as blobs first
                                                const blobs = await Promise.all(
                                                    msg.attachments.map(async (att) => {
                                                        const response = await fetch(att.url, {
                                                            mode: 'cors',
                                                            credentials: 'omit',
                                                            cache: 'no-cache'
                                                        });
                                                        return response.blob();
                                                    })
                                                );
                                                
                                                // Download all at once
                                                blobs.forEach((blob, i) => {
                                                    const blobUrl = URL.createObjectURL(blob);
                                                    const extension = blob.type.includes('png') ? 'png' : 
                                                                     blob.type.includes('gif') ? 'gif' : 
                                                                     blob.type.includes('webp') ? 'webp' : 'jpg';
                                                    
                                                    const link = document.createElement('a');
                                                    link.href = blobUrl;
                                                    link.download = `image_${i + 1}.${extension}`;
                                                    link.click();
                                                    
                                                    // Cleanup after a short delay
                                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                                                });
                                            };
                                            
                                            try {
                                                // Try to use File System Access API (folder picker)
                                                if (typeof window.showDirectoryPicker === 'function') {
                                                    try {
                                                        const dirHandle = await window.showDirectoryPicker({
                                                            mode: 'readwrite',
                                                            startIn: 'pictures'
                                                        });
                                                        
                                                        // Download all images to the selected folder
                                                        for (let i = 0; i < msg.attachments.length; i++) {
                                                            const att = msg.attachments[i];
                                                            
                                                            const response = await fetch(att.url, {
                                                                mode: 'cors',
                                                                credentials: 'omit',
                                                                cache: 'no-cache'
                                                            });
                                                            const blob = await response.blob();
                                                            
                                                            const extension = blob.type.includes('png') ? 'png' : 
                                                                             blob.type.includes('gif') ? 'gif' : 
                                                                             blob.type.includes('webp') ? 'webp' : 'jpg';
                                                            const filename = `image_${i + 1}.${extension}`;
                                                            
                                                            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                                                            const writable = await fileHandle.createWritable();
                                                            await writable.write(blob);
                                                            await writable.close();
                                                        }
                                                        
                                                        alert(`Successfully downloaded ${msg.attachments.length} images!`);
                                                    } catch (apiErr) {
                                                        // User cancelled or API failed - use fallback
                                                        if (apiErr.name !== 'AbortError') {
                                                            console.log('File System API failed, using fallback:', apiErr.message);
                                                            await fallbackDownload();
                                                        }
                                                    }
                                                } else {
                                                    // API not available, use fallback
                                                    await fallbackDownload();
                                                }
                                            } catch (err) {
                                                console.error('Failed to download images:', err);
                                                alert('Failed to download images. ' + err.message);
                                            }
                                            setShowMenu(false);
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-base">download</span>
                                        <span>Download All</span>
                                    </button>
                                ) : (
                                    // Copy button for single image or text messages
                                    <button 
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
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
                                                        new ClipboardItem({
                                                            'image/png': pngBlob
                                                        })
                                                    ]);
                                                } catch (err) {
                                                    console.error('Failed to copy image:', err);
                                                    alert('Failed to copy image. ' + err.message);
                                                }
                                            } else {
                                                navigator.clipboard.writeText(msg.content);
                                            }
                                            setShowMenu(false);
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-base">content_copy</span>
                                        <span>{msg.type === 'image' ? 'Copy' : 'Copy Text'}</span>
                                    </button>
                                )
                            )}

                            {/* [NEW] Pin/Unpin Option */}
                            {!isAi && onPin && !msg.is_deleted_for_everyone && (
                                <button 
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPin(msg);
                                        setShowMenu(false);
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base">{msg.is_pinned ? 'keep_off' : 'push_pin'}</span>
                                    <span>{msg.is_pinned ? 'Unpin' : 'Pin'}</span>
                                </button>
                            )}
                            
                             {!isAi && (
                                <button
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteForMe();
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base">delete</span>
                                    <span>Delete for me</span>
                                </button>
                             )}

                             {isAi && (
                                <button
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteForMe();
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base">delete</span>
                                    <span>Delete</span>
                                </button>
                             )}

                            {msg.user_id === user.id && !isAi && (
                                <button
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
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
                
                
                <div className={`text-[10px] mt-1 px-1 flex items-center justify-end gap-1 select-none transition-opacity ${
                    (msg.status === 'sending' || msg.is_pinned) 
                        ? 'opacity-100 text-slate-600 dark:text-slate-300' 
                        : `opacity-0 group-hover:opacity-100 ${isMe ? 'text-slate-600 dark:text-slate-400' : 'text-slate-600 dark:text-slate-400'}`
                }`}>
                    {msg.is_pinned && (
                        <span className="material-symbols-outlined text-[12px] -rotate-45" title="Pinned">keep</span>
                    )}
                    {formatTime(msg.created_at)}
                </div>
            </div>
        </div>
    );
};

export default function MessageList({ messages, setMessages, currentUser, roomId, socket, onReply, onDelete, onRetry, onEdit, onRegenerate, onPin, searchTerm, onLoadMore, loadingMore, hasMore, isAiChat }) { // [MODIFIED] Added onPin
    const { token } = useAuth();
    const [confirmDeleteMessage, setConfirmDeleteMessage] = useState(null);

    // [NEW] Viewer State
    const [viewingImage, setViewingImage] = useState(null);

    const [showScrollButton, setShowScrollButton] = useState(false);
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);
    const shouldScrollToBottom = useRef(true);
    
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

            // Optimistically update local state to "Opened"
            setMessages(prev => prev.map(m => m.id === msg.id ? { 
                ...m, 
                viewed_by: [...(m.viewed_by || []), currentUser.id] 
            } : m));

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
            .filter(m => !m.isMe && m.status !== 'seen' && m.user_id !== currentUser.id && m.type !== 'system')
            .map(m => m.id);

        if (unseenIds.length > 0) {
            socket.emit('mark_seen', { roomId, messageIds: unseenIds });
        }
    }, [messages, socket, roomId, currentUser.id]);

    useEffect(() => {
        const div = scrollRef.current;
        if (!div) return;
        
        const lastMsg = messages[messages.length - 1];
        // [FIX] Force scroll if the last message is from me (sent just now)
        // AI messages count as "from me" contextually if I triggered them? No, AI is separate.
        // But if I sent a prompt, I want to see it.
        const isLastMsgMine = lastMsg && lastMsg.user_id === currentUser.id;

        if (shouldScrollToBottom.current || isLastMsgMine) {
            if (messages.length > 0) {
                // [FIX] Use setTimeout to ensure DOM is fully painted/layout is done before scrolling
                const behavior = shouldScrollToBottom.current ? 'auto' : 'smooth';
                setTimeout(() => {
                    bottomRef.current?.scrollIntoView({ behavior });
                }, 100);
                shouldScrollToBottom.current = false;
            }
        } else {
            // If receiving others' messages, only scroll if we were already at bottom
            const isNearBottom = div.scrollHeight - div.scrollTop - div.clientHeight < 200; // Increased threshold
            if (isNearBottom) {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, [messages, currentUser.id]);

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

            {/* Empty State - outside scroll container */}
            {!hasMessages && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <NoMessages />
                </div>
            )}

            {/* Scrollable Messages Container - only show when there are messages */}
            <div 
                ref={scrollRef}
                className={`absolute inset-0 p-4 sm:p-6 space-y-1 sm:space-y-1.5 custom-scrollbar z-[1] ${
                    hasMessages ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
                }`}
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
                messages.filter(m => m.type !== 'poll_vote').map((msg, index) => {
                    // [FIX] AI messages might have same user_id but are NOT 'me' for display purposes
                    const isAi = msg.user_id === 'ai-assistant' || msg.author_name === 'Assistant' || (msg.meta && msg.meta.ai) || msg.isStreaming;
                    const isMe = msg.user_id == currentUser.id && !isAi;
                    const isSystem = msg.type === 'system';
                    
                    if (isSystem) {
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
                         }
 
                         return (
                             <div key={msg.id || index} className="flex justify-center my-6 group/system animate-slide-in-up">
                                 <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 backdrop-blur-sm transition-all hover:bg-white/80 dark:hover:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm">
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
                                                 return `${name} pinned a message`;
                                             }
                                             return linkifyText(msg.content, '', "text-blue-600 dark:text-blue-400 hover:underline");
                                         })()}
                                     </span>
                                     <span className="text-[10px] text-slate-500 dark:text-slate-600 opacity-0 group-hover/system:opacity-100 transition-opacity ml-2">
                                         {formatTime(msg.created_at)}
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
                            onImageLoad={handleImageLoad}
                            onRegenerate={onRegenerate}
                            onPin={onPin}
                            searchTerm={searchTerm}
                            scrollToMessage={scrollToMessage}
                            onImageClick={handleImageClick}
                            token={token}
                        />
                    );
                })
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
                    absolute bottom-5 right-5 w-10 h-10 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm 
                    border border-slate-200 dark:border-slate-700 shadow-lg shadow-black/10 dark:shadow-black/50 text-slate-600 dark:text-slate-200 
                    flex items-center justify-center z-20 transition-all duration-300 ease-in-out
                    hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white hover:scale-110 active:scale-95
                    ${showScrollButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
                `}
            >
                <span className="material-symbols-outlined text-xl">arrow_downward</span>
            </button>
            {confirmDeleteMessage && (
                <div className="
                    fixed inset-0 z-50 flex items-center justify-center
                    bg-slate-950/60 backdrop-blur-sm
                ">
                    <div className="
                        bg-white dark:bg-slate-900 rounded-2xl shadow-2xl
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
        </div>
    );
}

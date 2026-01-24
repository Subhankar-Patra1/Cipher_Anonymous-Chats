import { useState, useEffect, useRef, useMemo } from 'react';
import { usePresence } from '../context/PresenceContext';
import { useAppLock } from '../context/AppLockContext';
import { useChatLock } from '../context/ChatLockContext';
import { useTheme } from '../context/ThemeContext';
import StatusDot from './StatusDot';
import ProfileShareModal from './ProfileShareModal';
import ChatLockModal from './ChatLockModal';
import { linkifyText } from '../utils/linkify';
import SparkleLogo from './icons/SparkleLogo';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import SidebarContextMenu from './SidebarContextMenu';
import { ChatListSkeleton } from './SkeletonLoaders';
import PollIcon from './icons/PollIcon';
import ViewOnceIcon from './icons/ViewOnceIcon';
import emptySidebarGif from '../assets/empty_sidebar.gif';
import { cryptoManager } from '../lib/crypto/CryptoManager';
import db from '../utils/db';

// [NEW] E2EE Preview Component - Uses cached plaintext (WhatsApp-style)
const LastMessagePreview = ({ room, user, hasSkippedSync }) => {
    // [NEW] Local state for plaintext if not in room object
    const [localPlaintext, setLocalPlaintext] = useState(room.last_message_plaintext || null);
    // [FIX] Track the last message ID we've seen to detect changes
    const lastSeenIdRef = useRef(room.last_message_id);

    useEffect(() => {
        // [FIX] If room has no last message (cleared), reset local state
        if (!room.last_message_id) {
            setLocalPlaintext(null);
            lastSeenIdRef.current = null;
            return;
        }
        
        // [FIX] When message ID changes (new message), clear local state to prevent stale data
        if (room.last_message_id !== lastSeenIdRef.current) {
            lastSeenIdRef.current = room.last_message_id;
            // Don't clear if we already have matching plaintext
            if (localPlaintext !== room.last_message_content && localPlaintext !== room.last_message_plaintext) {
                setLocalPlaintext(null);
            }
        }
        
        // [FIX] When status is 'sending', prioritize room.last_message_content (optimistic update)
        // This ensures the sidebar shows the new message immediately, not stale Dexie data
        if (room.last_message_status === 'sending' && room.last_message_content) {
            setLocalPlaintext(null); // Clear local state to use room.last_message_content
            return;
        }
        
        // [FIX] If we have room.last_message_content and it's our message (sender_id matches),
        // use it directly - don't fetch from Dexie which might have old data
        if (room.last_message_content && String(room.last_message_sender_id) === String(user.id)) {
            if (!localPlaintext || localPlaintext === '__NO_KEY__' || localPlaintext === '__DECRYPT_FAILED__') {
                setLocalPlaintext(room.last_message_content);
            }
            return;
        }
        
        // Sync with room prop
        if (room.last_message_plaintext) {
            setLocalPlaintext(room.last_message_plaintext);
            return;
        }
        
        // [FIX] Only fetch from Dexie if we don't have valid content and it's not our recent message
        if (localPlaintext && localPlaintext !== '__NO_KEY__' && localPlaintext !== '__DECRYPT_FAILED__') {
            return; // Already have valid content, don't override
        }
        
        // [FIX] Check Dexie rooms cache first (instant load on second visit)
        db.rooms.get(room.id).then(cached => {
            if (cached?.last_message_plaintext) {
                setLocalPlaintext(cached.last_message_plaintext);
                return;
            }
            
            // Fallback: Check messages table for plaintext_content
            if (room.last_message_id) {
                db.messages.where('id').equals(String(room.last_message_id)).first().then(msg => {
                    if (msg?.plaintext_content) {
                        setLocalPlaintext(msg.plaintext_content);
                    }
                });
            }
        }).catch(() => {
            // Dexie not ready, fallback to messages table
            if (room.last_message_id) {
                db.messages.where('id').equals(String(room.last_message_id)).first().then(msg => {
                    if (msg?.plaintext_content) {
                        setLocalPlaintext(msg.plaintext_content);
                    }
                });
            }
        });
    }, [room.id, room.last_message_id, room.last_message_plaintext, room.last_message_status, room.last_message_content, room.last_message_sender_id, user.id]);

    // [FIX] Compute content - prioritize room props for own messages to prevent flicker
    const isOwnMessage = String(room.last_message_sender_id) === String(user.id);
    let rawContent = (room.last_message_status === 'sending' && room.last_message_content) 
        ? room.last_message_content 
        : (isOwnMessage && room.last_message_content && room.last_message_content !== '🔒 Encrypted Message')
            ? room.last_message_content
            : (localPlaintext || room.last_message_plaintext || room.last_message_content || '');
    
    // [FIX] For file messages, show the filename instead of "File"
    if (room.last_message_type === 'file' && (rawContent === 'File' || !rawContent) && room.last_message_file_name) {
        rawContent = room.last_message_file_name;
    }
    
    const isDecryptionFailed = rawContent === '__NO_KEY__' || rawContent === '__DECRYPT_FAILED__';
    const content = isDecryptionFailed ? '' : rawContent; // Empty string triggers fallback

    // [NEW] Helper to render preview with mentions highlighted
    const renderPreviewRaw = (rawContent) => {
        // [FIX] Handle retry delay state explicitly
        if (rawContent === '__RETRY_DELAY__') return 'Waiting for keys...';

        // [FIX] Handle special markers and empty content
        if (!rawContent || rawContent === 'Waiting for key...' || rawContent === 'Decryption Error' || isDecryptionFailed) {
            if (hasSkippedSync) return 'History hidden';
            
            // [FIX] Better fallbacks for E2EE messages on reload
            if (room.last_message_id) {
                if (room.last_message_ciphertext) return '🔒 Encrypted Message';
                if (room.last_message_type === 'image') return 'Photo';
                if (room.last_message_type === 'file') {
                    // [FIX] Show filename instead of just "File"
                    return room.last_message_file_name || 'File';
                }
                return 'Message';
            }
            return 'No messages here';
        }
        
        // [NEW] Mask spoilers with dots (no reveal in sidebar - Telegram behavior)
        rawContent = rawContent.replace(/\|\|.*?\|\|/g, '•••••');
        
        // Split by mention pattern: @[Name](user:ID)
        const parts = rawContent.split(/(@\[.*?\]\(user:\d+\))/g);
        
        return parts.map((part, i) => {
            const match = part.match(/@\[(.*?)\]\(user:(\d+)\)/);
            if (match) {
                const name = match[1];
                const id = match[2];
                // Check if it's me
                const isMe = String(id) === String(user.id);
                
                return (
                    <span 
                        key={i} 
                        className={isMe ? "text-violet-600 dark:text-violet-400 font-bold" : "font-semibold text-slate-700 dark:text-slate-300"}
                    >
                        @{renderTextWithEmojis(name)}
                    </span>
                );
            }
            // Regular text: render with emojis AND strip markdown
            const stripped = part
                .replace(/\*\*(.*?)\*\*/g, '$1') // Bold **
                .replace(/\*(.*?)\*/g, '$1')     // Italic *
                .replace(/__(.*?)__/g, '$1')     // Bold __
                .replace(/_(.*?)_/g, '$1')       // Italic _
                .replace(/`([^`]+)`/g, '$1')     // Code `
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Link [text](url)
                .replace(/^#+\s+/g, '');         // Heading #

            return renderTextWithEmojis(stripped);
        });
    };

    // [FIX] Track if we already tried decryption to prevent infinite loops
    const decryptAttemptedRef = useRef(false);

    // [NEW] Direct decryption from room data (bypasses IndexedDB) with caching
    useEffect(() => {
        // Reset attempt tracking when room changes
        decryptAttemptedRef.current = false;
    }, [room.id, room.last_message_id]);

    // [NEW] Listen for key updates to trigger re-decryption
    useEffect(() => {
        const handleKeysUpdated = (e) => {
            // If it's a bulk import (restore) or specific to this room
            if (e.detail?.type === 'bulk-import' || String(e.detail?.roomId) === String(room.id)) {
                // Only trigger if we are currently encrypted or failed
                if (!localPlaintext || localPlaintext === '__DECRYPT_FAILED__' || localPlaintext === '__NO_KEY__') {
                    decryptAttemptedRef.current = false;
                    // Force a re-run of the decryption effect
                    setLocalPlaintext(prev => prev === '__RETRY__' ? null : '__RETRY__');
                    // Reset to null after a micro-tick to ensure the second effect runs
                    setTimeout(() => setLocalPlaintext(null), 0);
                }
            }
        };

        window.addEventListener('cipher:keys-updated', handleKeysUpdated);
        return () => window.removeEventListener('cipher:keys-updated', handleKeysUpdated);
    }, [room.id, localPlaintext]);

    useEffect(() => {
        const decryptFromRoom = async () => {
            // Skip if already have plaintext
            if (localPlaintext && localPlaintext !== '__RETRY__') return;
            // Skip if no encrypted data
            if (!room.last_message_ciphertext || !room.last_message_iv) return;
            // Skip if user doesn't have keys (skipped sync)
            if (hasSkippedSync) return;
            // [FIX] Skip if already attempted for this message
            if (decryptAttemptedRef.current) return;
            
            decryptAttemptedRef.current = true; // Mark as attempted
            
            try {
                const roomId = String(room.id);
                const keyVersion = room.last_message_key_version;
                const salt = room.last_message_temp_id || room.last_message_id;
                
                // Get key from CryptoManager
                const keyData = await cryptoManager.getRoomKey(roomId, keyVersion);
                if (!keyData?.key) {
                    // [MODIFIED] If key is missing, allow retry later (don't mark as permanently failed)
                    decryptAttemptedRef.current = false;
                    // Trigger a retry after a short delay (e.g. keys might be loading)
                    setTimeout(() => {
                         if (lastSeenIdRef.current === room.last_message_id && (!localPlaintext || localPlaintext === '__RETRY__')) {
                             // Force update to retry
                             setLocalPlaintext(prev => prev === '__RETRY_DELAY__' ? null : '__RETRY_DELAY__'); 
                         }
                    }, 2000);
                    return;
                }
                
                // Decrypt directly from room data
                const decrypted = await cryptoManager.decryptMessage(
                    room.last_message_ciphertext,
                    room.last_message_iv,
                    salt,
                    keyData.key,
                    null,
                    roomId,
                    keyVersion
                );
                
                // [FIX] Only set if decrypted has actual content (not empty string)
                if (decrypted && decrypted.trim()) {
                    setLocalPlaintext(decrypted);
                    
                    // [OPTIMIZATION] Cache to Dexie - prevents re-decryption on reload
                    try {
                        db.rooms.put({ id: room.id, last_message_plaintext: decrypted });
                    } catch (e) { /* Ignore write errors */ }
                } else {
                    setLocalPlaintext('__DECRYPT_FAILED__');
                }
            } catch (err) {
                console.warn('[Sidebar] Direct decryption failed:', err);
                setLocalPlaintext('__DECRYPT_FAILED__');
            }
        };
        
        decryptFromRoom();
    }, [room, room.id, room.last_message_ciphertext, room.last_message_iv, 
        room.last_message_key_version, room.last_message_plaintext, 
        room.last_message_temp_id, room.last_message_id,
        localPlaintext, hasSkippedSync]);

    // [NEW] Reaction Summary
    const reactionSummary = useMemo(() => {
        let r = room.last_message_reactions;
        if (!r) return null;
        if (typeof r === 'string') {
            try { r = JSON.parse(r); } catch { return null; }
        }
        if (!Array.isArray(r) || r.length === 0) return null;
        
        // Use most recent (last in array usually, based on aggregation?)
        // Aggregation order is undefined without order by. 
        // We'll just take the first one for now as a "sample".
        const sample = r[0];
        return (
            <span className="ml-1.5 inline-flex items-center justify-center bg-slate-200 dark:bg-slate-700/80 rounded-full px-1 h-[15px] min-w-[15px] text-[9px] text-slate-600 dark:text-slate-300 shrink-0 border border-white dark:border-slate-800">
                <span className="-translate-y-[0.5px] flex items-center justify-center">
                    {renderTextWithEmojis(sample.reaction, '1.1em')}
                </span>
                {r.length > 1 && <span className="ml-0.5 font-bold">{r.length}</span>}
            </span>
        );
    }, [room.last_message_reactions, user.id]);

    // [NEW] Check for reactions to adjust prefix
    const hasReactions = useMemo(() => {
        let r = room.last_message_reactions;
        if (!r) return false;
        if (typeof r === 'string') { try { r = JSON.parse(r); } catch { return false; } }
        return Array.isArray(r) && r.length > 0;
    }, [room.last_message_reactions]);

    // [NEW] Decrypted reaction preview state
    const [reactionPreview, setReactionPreview] = useState(null);
    
    // Decrypt reaction message content when needed
    useEffect(() => {
        if (!room.latest_reaction) {
            setReactionPreview(null);
            return;
        }
        
        const lr = room.latest_reaction;
        
        // For non-encrypted messages, set preview immediately
        if (lr.message_type === 'image') { setReactionPreview('Photo'); return; }
        if (lr.message_type === 'audio') { setReactionPreview('Voice message'); return; }
        if (lr.message_type === 'file') { setReactionPreview(lr.message_file_name || 'File'); return; }
        if (lr.message_type === 'gif') { setReactionPreview('GIF'); return; }
        if (lr.message_type === 'location') { setReactionPreview('Location'); return; }
        if (lr.message_type === 'poll') { setReactionPreview('Poll'); return; }
        
        // [FIX] Prioritize decryption when encrypted data is available
        // Server's message_content may be stale/wrong for encrypted messages
        if (lr.message_ciphertext && lr.message_iv) {
            (async () => {
                try {
                    const keyData = await cryptoManager.getRoomKey(String(room.id), lr.message_key_version);
                    const salt = lr.message_temp_id || lr.message_id;
                    const decryptedText = await cryptoManager.decryptMessage(
                        lr.message_ciphertext,
                        lr.message_iv,
                        salt,
                        keyData?.key || null,
                        null,
                        String(room.id),
                        lr.message_key_version
                    );
                    if (decryptedText) {
                        const text = decryptedText.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                        setReactionPreview(text.length > 30 ? `"${text.slice(0, 30)}..."` : `"${text}"`);
                    } else {
                        setReactionPreview('a message');
                    }
                } catch (e) {
                    setReactionPreview('a message');
                }
            })();
            return;
        }
        
        // Fallback: use plaintext content if no encrypted data
        if (lr.message_content) {
            const text = lr.message_content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            setReactionPreview(text.length > 30 ? `"${text.slice(0, 30)}..."` : `"${text}"`);
            return;
        }
        
        setReactionPreview('a message');
    }, [room.latest_reaction, room.id]);
    
    const reactionNotification = useMemo(() => {
        // [NEW] First check for latest_reaction (reactions on ANY message, not just last)
        if (room.latest_reaction && reactionPreview) {
            const lr = room.latest_reaction;
            
            // [FIX] Only show reaction notification if it's more recent than the last message
            // If a new message was sent after the reaction, show the message instead
            const reactionTime = lr.timestamp ? new Date(lr.timestamp).getTime() : 0;
            const lastMessageTime = room.last_message_created_at ? new Date(room.last_message_created_at).getTime() : 0;
            
            if (lastMessageTime > reactionTime) {
                // Last message is newer than the reaction, don't show reaction notification
                return null;
            }
            
            const isMe = String(lr.user_id) === String(user.id);
            const reactorName = isMe ? 'You' : renderTextWithEmojis(lr.display_name || 'Someone');
            const emoji = lr.emoji;
            
            return (
                <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 min-w-0">
                    <span className={`shrink-0 ${isMe ? "" : "font-medium text-slate-600 dark:text-slate-300"}`}>{reactorName}</span>
                    <span className="shrink-0">reacted</span>
                    <span className="text-base flex items-center shrink-0">{renderTextWithEmojis(emoji, '1.2em')}</span>
                    <span className="truncate">to: {reactionPreview}</span>
                </span>
            );
        }
        
        // Fallback: Check last_message_reactions for reactions on the last message
        let r = room.last_message_reactions;
        if (!r) return null;
        if (typeof r === 'string') { try { r = JSON.parse(r); } catch { return null; } }
        if (!Array.isArray(r) || r.length === 0) return null;

        const latest = r[0];
        const isMe = String(latest.userId) === String(user.id);
        const reactorName = isMe ? 'You' : renderTextWithEmojis(latest.display_name || 'Someone');
        const emoji = latest.reaction;
        
        // Preview text for "to: ..."
        let preview = '';
        if (room.last_message_is_deleted) preview = "Deleted message";
        else if (room.last_message_type === 'image') {
            const isOpened = room.last_message_is_view_once && room.last_message_viewed_by && room.last_message_viewed_by.length > 0;
            preview = isOpened ? "Opened" : "Photo";
        }
        else if (room.last_message_type === 'video') preview = "Video";
        else if (room.last_message_type === 'file') preview = room.last_message_file_name || "Document";
        else if (room.last_message_type === 'audio') preview = "Voice message";
        else if (room.last_message_type === 'gif') preview = "GIF";
        else if (room.last_message_type === 'poll') preview = room.last_message_poll_question || "Poll";
        else preview = renderPreviewRaw(content);

        // Check if this is a view-once photo
        const isViewOnceImage = room.last_message_type === 'image' && room.last_message_is_view_once;
        const isLastMessageMe = String(room.last_message_sender_id) === String(user.id);
        const viewedCount = room.last_message_viewed_by?.length || 0;
        const memberCount = room.member_count || 2;
        const isOpened = isViewOnceImage && (isLastMessageMe 
            ? (viewedCount >= (memberCount - 1))
            : (room.last_message_viewed_by?.includes(user.id)));

        return (
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 min-w-0">
                <span className={`shrink-0 ${isMe ? "" : "font-medium text-slate-600 dark:text-slate-300"}`}>{reactorName}</span>
                <span className="shrink-0">reacted</span>
                <span className="text-base flex items-center shrink-0">{renderTextWithEmojis(emoji, '1.2em')}</span>
                <span className="ml-0.5 flex items-center gap-1.5 truncate">
                    to: "{isViewOnceImage && <ViewOnceIcon className="w-3.5 h-3.5" isOpened={isOpened} />}{preview}"
                </span>
            </span>
        );
    }, [room.latest_reaction, reactionPreview, room.last_message_id, room.last_message_reactions, room.last_message_type, room.last_message_is_deleted, room.last_message_file_name, room.last_message_poll_question, room.last_message_created_at, content, user.id]);

    // If there's a reaction notification, show it instead of the message content
    if (reactionNotification) {
        return (
            <span className="flex items-center min-w-0">
                <span className="truncate py-0.5 leading-normal">{reactionNotification}</span>
            </span>
        );
    }

    // [FIX] Show file icon for file messages
    const showFileIcon = room.last_message_type === 'file';

    return (
        <span className="flex items-center min-w-0 gap-1">
            {showFileIcon && (
                <span className="material-symbols-outlined text-[14px] text-slate-400 dark:text-slate-500 shrink-0">description</span>
            )}
            <span className="truncate py-0.5 leading-normal">{renderPreviewRaw(content)}</span>
            {reactionSummary}
        </span>
    );
};

export default function Sidebar({ rooms, activeRoom, onSelectRoom, loadingRoomId, isLoading, onCreateRoom, onJoinRoom, user, onLogout, onRefresh, onRoomLocked, onGoToMessage, hasSkippedSync, typingByRoom, onShowProfile }) { // [MODIFIED] Added onShowProfile

    const { presenceMap, fetchStatuses } = usePresence();
    const { hasPasscode, lockApp } = useAppLock();
    const { isRoomLocked, requestUnlock, cancelUnlock } = useChatLock();
    const { theme, toggleTheme } = useTheme();
    const [tab, setTab] = useState('group'); // 'group' or 'direct'
    const [searchQuery, setSearchQuery] = useState('');
    const [archivedSearchQuery, setArchivedSearchQuery] = useState('');
    const [showShareProfile, setShowShareProfile] = useState(false);
    const [showChatLockModal, setShowChatLockModal] = useState(null); // room to lock/unlock

    // [NEW] Archived State
    const [viewArchived, setViewArchived] = useState(false);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, room: null });
    
    // [NEW] Draft messages state - check localStorage
    const [drafts, setDrafts] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('cipher_drafts') || '{}');
        } catch {
            return {};
        }
    });

    // Update drafts when localStorage changes (on focus or custom event)
    useEffect(() => {
        const updateDrafts = () => {
            try {
                const storedDrafts = JSON.parse(localStorage.getItem('cipher_drafts') || '{}');
                setDrafts(storedDrafts);
            } catch {
                setDrafts({});
            }
        };
        
        // Listen for focus (when switching tabs)
        window.addEventListener('focus', updateDrafts);
        // Listen for custom event (when draft changes in same tab)
        window.addEventListener('draftsUpdated', updateDrafts);
        
        return () => {
            window.removeEventListener('focus', updateDrafts);
            window.removeEventListener('draftsUpdated', updateDrafts);
        };
    }, []);

    const filteredRooms = rooms.filter(r => {
        if (viewArchived) {
             if (!r.is_archived || r.type === 'ai') return false;
             if (!archivedSearchQuery.trim()) return true;
             return r.name.toLowerCase().includes(archivedSearchQuery.toLowerCase());
        }
        if (r.is_archived) return false; // Hide archived from main list

        if (r.type !== tab) return false;
        if (tab === 'ai') return true;
        if (!searchQuery.trim()) return true;
        return r.name.toLowerCase().includes(searchQuery.toLowerCase());
    });
    
    // Reset viewArchived when tab changes
    useEffect(() => {
        setViewArchived(false);
        setSearchQuery('');
        setArchivedSearchQuery('');
    }, [tab]);
    
    // Fetch status for direct chat users
    useEffect(() => {
        const userIds = rooms
            .filter(r => r.type === 'direct' && r.other_user_id)
            .map(r => r.other_user_id);
            
        if (userIds.length > 0) {
            fetchStatuses(userIds);
        }
    }, [rooms]);

    // [NEW] Auto-init AI session when switching to AI tab
    useEffect(() => {
        if (tab === 'ai') {
            const initAi = async () => {
                const existing = rooms.find(r => r.type === 'ai');
                if (existing) return;

                try {
                    const token = localStorage.getItem('token');
                    await fetch(`${import.meta.env.VITE_API_URL}/api/ai/session`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    // Dashboard socket 'room_added' handles the rest
                } catch (e) {
                    console.error(e);
                }
            };
            initAi();
        }
    }, [tab, rooms]);

    // [NEW] Helper to render preview with mentions highlighted
    const renderPreview = (content) => {
        if (!content) return 'No messages here';
        
        // [NEW] Mask spoilers with dots (no reveal in sidebar - Telegram behavior)
        content = content.replace(/\|\|.*?\|\|/g, '•••••');
        
        // Split by mention pattern: @[Name](user:ID)
        const parts = content.split(/(@\[.*?\]\(user:\d+\))/g);
        
        return parts.map((part, i) => {
            const match = part.match(/@\[(.*?)\]\(user:(\d+)\)/);
            if (match) {
                const name = match[1];
                const id = match[2];
                // Check if it's me
                const isMe = String(id) === String(user.id);
                
                return (
                    <span 
                        key={i} 
                        className={isMe ? "text-violet-600 dark:text-violet-400 font-bold" : "font-semibold text-slate-700 dark:text-slate-300"}
                    >
                        @{renderTextWithEmojis(name)}
                    </span>
                );
            }
            // Regular text: render with emojis AND strip markdown
            const stripped = part
                .replace(/\*\*(.*?)\*\*/g, '$1') // Bold **
                .replace(/\*(.*?)\*/g, '$1')     // Italic *
                .replace(/__(.*?)__/g, '$1')     // Bold __
                .replace(/_(.*?)_/g, '$1')       // Italic _
                .replace(/`([^`]+)`/g, '$1')     // Code `
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Link [text](url)
                .replace(/^#+\s+/g, '');         // Heading #

            return renderTextWithEmojis(stripped);
        });
    };

    const [isLocking, setIsLocking] = useState(false);

    const handleLockClick = () => {
        setIsLocking(true);
        // Play animation immediately while locking
        setTimeout(() => {
            lockApp();
            setIsLocking(false);
        }, 50);
    };

    return (
        <div className="w-full h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl transition-colors">
            {/* ... (Header) ... */}
            <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center bg-white/30 dark:bg-slate-900/30">
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                    <div 
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                        onClick={onShowProfile}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-500/20 overflow-hidden shrink-0 ${!user.avatar_thumb_url ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}>
                            {user.avatar_thumb_url ? (
                                <img src={user.avatar_thumb_url} alt="Me" className="w-full h-full object-cover" />
                            ) : (
                                user.display_name[0].toUpperCase()
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate transition-colors flex items-center gap-1">{renderTextWithEmojis(user.display_name)}</h2>
                            <div className="flex items-center gap-1">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium transition-colors truncate">
                                    {user.username.startsWith('@') ? user.username : `@${user.username}`}
                                </p>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowShareProfile(true);
                        }}
                        className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white transition-colors"
                        title="Share Profile"
                    >
                        <span className="material-symbols-outlined text-[14px]">qr_code_2</span>
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    
                    {/* [NEW] Auto-Backup Status Indicator */}
                    <div 
                        className="group/backup relative flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-help"
                        title={cryptoManager.isAutoBackupEnabled() ? "Auto-backup Active (Session)" : "Auto-backup Inactive"}
                    >
                        <span className={`material-symbols-outlined text-lg ${cryptoManager.isAutoBackupEnabled() ? 'text-green-500' : 'text-slate-300 dark:text-slate-600'}`}>
                            {cryptoManager.isAutoBackupEnabled() ? 'cloud_done' : 'cloud_off'}
                        </span>
                        
                        {/* Tooltip */}
                        <div className="absolute top-10 right-0 w-max pointer-events-none opacity-0 group-hover/backup:opacity-100 transition-opacity duration-200 z-50">
                             <div className="bg-[#2a2a2a] text-white text-xs py-2 px-3 rounded-lg shadow-xl border border-white/5 relative">
                                {cryptoManager.isAutoBackupEnabled() 
                                    ? "Auto-backup is ON for this session." 
                                    : "Auto-backup is OFF. Restore to enable."}
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={(e) => toggleTheme(e)} 
                        className="p-2 rounded-full text-slate-400 dark:text-slate-400 hover:text-amber-500 dark:hover:text-yellow-400 transition-all duration-200"
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        <span className="material-symbols-outlined text-xl transition-transform duration-500 rotate-0 dark:rotate-180">
                            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    <button 
                        onClick={onLogout} 
                        className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-all duration-200"
                        title="Logout"
                    >
                        <span className="material-symbols-outlined text-xl">logout</span>
                    </button>
                    
                    {hasPasscode && (
                        <div className="relative group/lock-container">
                             <button 
                                onClick={handleLockClick}
                                className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-violet-500 hover:bg-violet-100 dark:hover:text-violet-400 dark:hover:bg-violet-900/20 transition-all duration-200 relative"
                            >
                                <span className={`material-symbols-outlined text-xl transition-all duration-300 ${isLocking ? 'scale-110 text-violet-500' : ''}`}>
                                    {isLocking ? 'lock' : 'lock_open'}
                                </span>
                            </button>
                            
                            {/* Custom Tooltip */}
                            <div className="absolute top-12 right-0 w-max pointer-events-none opacity-0 group-hover/lock-container:opacity-100 transition-opacity duration-200 z-50">
                                <div className="bg-[#2a2a2a] text-white text-xs py-2 px-3 rounded-lg shadow-xl border border-white/5 relative">
                                    Tap to lock Cipher.
                                    {/* Triangle pointer */}
                                    <div className="absolute -top-1 right-3 w-2 h-2 bg-[#2a2a2a] border-t border-l border-white/5 transform rotate-45"></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 pb-2">
                <div className="flex p-1 bg-slate-100 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800/50 transition-colors">
                    <button 
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative ${tab === 'group' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        onClick={() => setTab('group')}
                    >
                        Groups
                        {rooms.filter(r => r.type === 'group' && r.unread_count > 0).length > 0 && (
                            <span className="absolute -top-1 -right-0 min-w-[18px] h-[18px] bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-white dark:border-slate-900">
                                {rooms.filter(r => r.type === 'group' && r.unread_count > 0).length > 99 ? '99+' : rooms.filter(r => r.type === 'group' && r.unread_count > 0).length}
                            </span>
                        )}
                    </button>
                    <button 
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative ${tab === 'direct' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        onClick={() => setTab('direct')}
                    >
                        Direct
                        {rooms.filter(r => r.type === 'direct' && r.unread_count > 0).length > 0 && (
                            <span className="absolute -top-1 -right-0 min-w-[18px] h-[18px] bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-white dark:border-slate-900">
                                {rooms.filter(r => r.type === 'direct' && r.unread_count > 0).length > 99 ? '99+' : rooms.filter(r => r.type === 'direct' && r.unread_count > 0).length}
                            </span>
                        )}
                    </button>
                    <button 
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center ${tab === 'ai' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        onClick={() => setTab('ai')}
                    >
                        <div className="relative inline-flex items-center">
                            AI
                            <div className="absolute -top-1.5 -right-2.5">
                                <SparkleLogo className={`w-3.5 h-3.5 ${tab === 'ai' ? 'opacity-100' : 'opacity-70 grayscale hover:grayscale-0 transition-all'}`} />
                            </div>
                        </div>
                    </button>
                </div>
                </div>

            

            
            {/* Search Bar - Only for Direct and Groups (Main View) */}
            {tab !== 'ai' && !viewArchived && (
                <div className="px-4 pb-2">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                            search
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={tab === 'group' ? "Search groups..." : "Search people..."}
                            className="w-full bg-slate-100 dark:bg-slate-950/50 border border-slate-300 dark:border-slate-700 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Archived Toggle Row - Moved Below Search */}
            {!viewArchived && rooms.some(r => r.is_archived) && tab !== 'ai' && !searchQuery && (
                <div className="px-4 pb-1">
                    <button 
                        onClick={() => setViewArchived(true)}
                        className="w-full flex items-center justify-between p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-md transition-colors text-sm font-medium"
                    >
                        <div className="flex items-center gap-2">
                             <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                             <span>Archived</span>
                        </div>
                        <span className="text-xs bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                            {rooms.filter(r => r.is_archived).length}
                        </span>
                    </button>
                </div>
            )}

            {/* Back from Archived Header + Search */}
            {viewArchived && (
                 <div className="flex flex-col border-b border-slate-100 dark:border-slate-800/50">
                     <div className="px-4 py-2 flex items-center gap-2">
                         <button 
                            onClick={() => setViewArchived(false)}
                            className="p-1 rounded-full transition-colors text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                         >
                             <span className="material-symbols-outlined text-sm">arrow_back</span>
                         </button>
                         <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Archived Chats</span>
                     </div>
                     <div className="px-4 pb-2">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                                search
                            </span>
                            <input
                                type="text"
                                value={archivedSearchQuery}
                                onChange={(e) => setArchivedSearchQuery(e.target.value)}
                                placeholder="Search archived..."
                                className="w-full bg-slate-100 dark:bg-slate-950/50 border border-slate-300 dark:border-slate-700 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                            />
                            {archivedSearchQuery && (
                                <button 
                                    onClick={() => setArchivedSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            )}
                        </div>
                    </div>
                 </div>
            )}

            {/* Room List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                {/* Show skeleton while loading */}
                {isLoading ? (
                    <ChatListSkeleton count={6} />
                ) : filteredRooms.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        {tab === 'ai' ? (
                            <div className="flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-3xl text-slate-300">smart_toy</span>
                                <span>No AI chats yet.</span>
                                <span className="text-xs text-slate-400">Initializing...</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <img 
                                    src={emptySidebarGif} 
                                    alt="No chats" 
                                    className="w-28 h-28 object-contain opacity-90 grayscale-[0.2] mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 dark:opacity-80" 
                                />
                                <p className="text-slate-700 dark:text-slate-200 font-medium text-base mt-2">
                                    No {tab} chats yet
                                </p>
                                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 max-w-[200px] mx-auto leading-relaxed">
                                    {tab === 'group' ? "Create a group to get involved!" : "Start a conversation to connect."}
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    filteredRooms.map(room => (
                    <div
                        key={room.id}
                        onClick={() => {
                            // Check if room is locked - always ask for passcode
                            if (isRoomLocked(room.id)) {
                                requestUnlock(room);
                                return;
                            }
                            cancelUnlock(); // [FIX] Clear any pending lock screen from previous interaction
                            onSelectRoom(room);
                        }}
                        // disabled={loadingRoomId === room.id} // Div doesn't support disabled, handle via class or logic
                        className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all duration-200 group hover:translate-x-1 cursor-pointer select-none ${
                            activeRoom?.id === room.id 
                            ? 'bg-violet-100 dark:bg-violet-600/10 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/20 shadow-sm' 
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                        } ${loadingRoomId === room.id ? 'opacity-50 pointer-events-none' : ''}`}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (room.type === 'ai') return;
                            setContextMenu({
                                visible: true,
                                x: e.clientX,
                                y: e.clientY,
                                room: room
                            });
                        }}
                    >
                        <div className={`w-10 h-10 flex items-center justify-center ${room.type === 'direct' || room.type === 'ai' ? 'rounded-full' : 'rounded-lg p-2'} ${activeRoom?.id === room.id ? 'bg-violet-200 dark:bg-violet-500/20' : 'bg-slate-200 dark:bg-slate-800 group-hover:bg-slate-300 dark:group-hover:bg-slate-700'} transition-colors relative`}>
                            {room.avatar_thumb_url ? (
                                <img src={room.avatar_thumb_url} alt={room.name} className={`w-full h-full object-cover ${room.type === 'direct' ? 'rounded-full' : 'rounded-lg'}`} />
                            ) : room.type === 'direct' ? (
                                <span className="text-sm font-bold">
                                    {room.name[0].toUpperCase()}
                                </span>
                            ) : room.type === 'ai' ? (
                                <SparkleLogo className="w-6 h-6" />
                            ) : (
                                <span className="material-symbols-outlined text-lg">
                                    group
                                </span>
                            )}
                            {room.type === 'direct' && room.other_user_id && !room.is_blocked_by_me && !room.is_blocked_by_them && (
                                <StatusDot online={presenceMap[room.other_user_id]?.online} />
                            )}
                            {/* Lock Badge */}
                            {isRoomLocked(room.id) && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0 flex justify-between items-center">
                            <div className="min-w-0">
                                <span className="truncate font-medium block">
                                    {room.type === 'ai' ? 'Sparkle AI' : linkifyText(room.name)}
                                </span>
                                {room.type === 'group' && !room.last_message_content && !room.last_message_type && !drafts[room.id] ? (
                                    <span className="text-[10px] text-slate-500 font-mono">#{room.code}</span>
                                ) : drafts[room.id] ? (() => {
                                    // Process draft:
                                    let draftText = drafts[room.id];
                                    // 1. Replace emoji img tags with their alt text
                                    draftText = draftText.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1');
                                    // 2. Strip remaining HTML tags
                                    draftText = draftText.replace(/<[^>]*>/g, '');
                                    // 3. Decode common entities (like &nbsp;)
                                    draftText = draftText.replace(/&nbsp;/g, ' ');
                                    // 4. Mask spoilers
                                    draftText = draftText.replace(/\|\|.*?\|\|/g, '•••••');
                                    
                                    return (
                                        <div className="text-xs truncate flex items-center gap-1">
                                            <span className="text-orange-500 dark:text-orange-400 font-medium shrink-0">Draft:</span>
                                            <span className="text-slate-500 dark:text-slate-400 truncate py-0.5 leading-normal">
                                                {renderTextWithEmojis(draftText.slice(0, 60), '1.1em')}
                                            </span>
                                        </div>
                                    );
                                })() : isRoomLocked(room.id) ? (
                                    <div className="text-xs truncate flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                        </svg>
                                        <span>Locked Chat</span>
                                    </div>
                                ) : room.is_blocked_by_me ? (
                                    <div className="text-xs flex items-center gap-1 text-slate-500 dark:text-slate-400 italic min-w-0">
                                        <span className="material-symbols-outlined text-[16px] shrink-0">block</span>
                                        <span className="truncate pr-1">You blocked this user</span>
                                    </div>
                                ) : typingByRoom[room.id] && typingByRoom[room.id].length > 0 ? (
                                    <div className="text-[12px] text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1.5 animate-pulse-slow">
                                        <div className="flex gap-0.5 items-center bg-violet-100 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full">
                                            <div className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        <span className="truncate">
                                            {room.type === 'direct' ? 'typing...' : (
                                                typingByRoom[room.id].length === 1 ? (
                                                    <>{renderTextWithEmojis(typingByRoom[room.id][0].name)} is typing...</>
                                                ) : (
                                                    <>{typingByRoom[room.id].length} people are typing...</>
                                                )
                                            )}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 min-w-0">
                                        {String(room.last_message_sender_id) === String(user.id) && room.type !== 'ai' && !room.last_message_is_deleted && !['image', 'file', 'video', 'audio', 'location', 'gif', 'poll'].includes(room.last_message_type) && (
                                            <span className={`material-symbols-outlined text-[16px] shrink-0 ${
                                                room.last_message_status === 'seen' ? 'text-blue-500' :
                                                room.last_message_status === 'error' ? 'text-red-400' :
                                                'text-slate-400'
                                            }`}>
                                                {(room.last_message_status === 'sending' || room.last_message_status === 'pending') ? 'access_time' : 
                                                 room.last_message_status === 'error' ? 'error' :
                                                 room.last_message_status === 'sent' ? 'check' : 
                                                 'done_all'}
                                            </span>
                                        )}
                                        <span className="flex-1 truncate">
                                            {(() => {
                                                const rRaw = room.last_message_reactions;
                                                let r = [];
                                                if (rRaw) {
                                                    if (typeof rRaw === 'string') { try { r = JSON.parse(rRaw); } catch {} }
                                                    else if (Array.isArray(rRaw)) { r = rRaw; }
                                                }
                                                const hasReactions = r.length > 0;

                                                if (room.last_message_is_deleted) {
                                                    return (
                                                        <span className="inline-flex items-center gap-1 italic text-slate-500 dark:text-slate-400">
                                                            <span className="material-symbols-outlined text-[16px] shrink-0">block</span>
                                                            <span className="pr-1">This message was deleted</span>
                                                        </span>
                                                    );
                                                }

                                                if (hasReactions) {
                                                    return (
                                                        <span className="flex items-center">
                                                            {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_id && (
                                                                <span className="mr-1 shrink-0 inline-flex items-center">
                                                                    You:
                                                                </span>
                                                            )}
                                                            {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_sender_id && (
                                                                <span className="mr-1 shrink-0 inline-flex items-center">
                                                                    <>{renderTextWithEmojis(room.last_message_sender_name || 'User')}:</>
                                                                </span>
                                                            )}
                                                            <LastMessagePreview room={room} user={user} hasSkippedSync={hasSkippedSync} />
                                                        </span>
                                                    );
                                                }

                                                // Regular rendering (No Reactions)
                                                switch (room.last_message_type) {
                                                    case 'image':
                                                        return (
                                                            <span className="flex items-center gap-1">
                                                                {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center">You:</span>
                                                                )}
                                                                {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center"><>{renderTextWithEmojis(room.last_message_sender_name || 'User')}:</></span>
                                                                )}
                                                                 {room.last_message_is_view_once ? (() => {
                                                                     const isLastMessageMe = String(room.last_message_sender_id) === String(user.id);
                                                                     const viewedCount = room.last_message_viewed_by?.length || 0;
                                                                     const memberCount = room.member_count || 2;
                                                                     const isOpened = isLastMessageMe 
                                                                         ? (viewedCount >= (memberCount - 1))
                                                                         : (room.last_message_viewed_by?.includes(user.id));
                                                                     
                                                                     return (
                                                                         <div className="flex items-center gap-1">
                                                                             <ViewOnceIcon 
                                                                                 className="w-4 h-4 text-slate-500 dark:text-slate-400" 
                                                                                 isOpened={isOpened} 
                                                                             />
                                                                             <span className={`truncate ${isOpened ? 'text-slate-500 dark:text-slate-400' : ''}`}>
                                                                                 {isOpened ? 'Opened' : 'Photo'}
                                                                             </span>
                                                                         </div>
                                                                     );
                                                                 })() : (
                                                                    <>
                                                                        {String(room.last_message_sender_id) === String(user.id) && (
                                                                             <span className={`material-symbols-outlined text-[16px] shrink-0 mr-1 ${
                                                                                room.last_message_status === 'seen' ? 'text-blue-500' :
                                                                                room.last_message_status === 'error' ? 'text-red-400' :
                                                                                'text-slate-400'
                                                                            }`}>
                                                                                {(room.last_message_status === 'sending' || room.last_message_status === 'pending') ? 'access_time' : 
                                                                                 room.last_message_status === 'error' ? 'error' :
                                                                                 room.last_message_status === 'sent' ? 'check' : 
                                                                                 'done_all'}
                                                                            </span>
                                                                        )}
                                                                        <span className="material-symbols-outlined text-[18px] translate-y-[0.5px] shrink-0">image</span>
                                                                        <span className="truncate py-0.5 leading-normal">
                                                                            {room.last_message_attachments_count > 1 
                                                                                ? `${room.last_message_attachments_count} Photos`
                                                                                : (room.last_message_caption ? renderTextWithEmojis(room.last_message_caption) : 'Photo')}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </span>
                                                        );
                                                    case 'file':
                                                        return (
                                                            <span className="flex items-center gap-1">
                                                                {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center">You:</span>
                                                                )}
                                                                {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center"><>{renderTextWithEmojis(room.last_message_sender_name || 'User')}:</></span>
                                                                )}
                                                                {String(room.last_message_sender_id) === String(user.id) && (
                                                                     <span className={`material-symbols-outlined text-[16px] shrink-0 ${
                                                                        room.last_message_status === 'error' ? 'text-red-400' :
                                                                        room.last_message_status === 'seen' ? 'text-blue-500' :
                                                                        'text-slate-400'
                                                                    }`}>
                                                                        {(room.last_message_status === 'sending' || room.last_message_status === 'pending') ? 'access_time' : 
                                                                         room.last_message_status === 'error' ? 'error' :
                                                                         room.last_message_status === 'sent' ? 'check' : 
                                                                         'done_all'}
                                                                    </span>
                                                                )}
                                                                <span className="material-symbols-outlined text-[18px] translate-y-[0.5px] shrink-0">description</span>
                                                                    <span className="truncate py-0.5 leading-normal">
                                                                        {room.last_message_file_name || 'File'}
                                                                        {room.last_message_caption ? <> • {renderTextWithEmojis(room.last_message_caption)}</> : ''}
                                                                    </span>
                                                            </span>
                                                        );
                                                    case 'location':
                                                        return (
                                                            <span className="flex items-center gap-1">
                                                                {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center">You:</span>
                                                                )}
                                                                {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center"><>{renderTextWithEmojis(room.last_message_sender_name || 'User')}:</></span>
                                                                )}
                                                                {String(room.last_message_sender_id) === String(user.id) && (
                                                                     <span className={`material-symbols-outlined text-[16px] shrink-0 ${
                                                                        room.last_message_status === 'error' ? 'text-red-400' :
                                                                        room.last_message_status === 'seen' ? 'text-blue-500' :
                                                                        'text-slate-400'
                                                                    }`}>
                                                                        {(room.last_message_status === 'sending' || room.last_message_status === 'pending') ? 'access_time' : 
                                                                         room.last_message_status === 'error' ? 'error' :
                                                                         room.last_message_status === 'sent' ? 'check' : 
                                                                         'done_all'}
                                                                    </span>
                                                                )}
                                                                <span className="material-symbols-outlined text-[18px] translate-y-[0.5px] shrink-0">location_on</span>
                                                                <span>Location</span>
                                                            </span>
                                                        );
                                                    case 'audio':
                                                        return (
                                                            <span className="flex items-center gap-1">
                                                                {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center">You:</span>
                                                                )}
                                                                {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center"><>{renderTextWithEmojis(room.last_message_sender_name || 'User')}:</></span>
                                                                )}
                                                                {String(room.last_message_sender_id) === String(user.id) && (
                                                                     <span className={`material-symbols-outlined text-[16px] shrink-0 ${
                                                                        room.last_message_status === 'error' ? 'text-red-400' :
                                                                        room.last_message_status === 'seen' ? 'text-blue-500' :
                                                                        'text-slate-400'
                                                                    }`}>
                                                                        {(room.last_message_status === 'sending' || room.last_message_status === 'pending') ? 'access_time' : 
                                                                         room.last_message_status === 'error' ? 'error' :
                                                                         room.last_message_status === 'sent' ? 'check' : 
                                                                         'done_all'}
                                                                    </span>
                                                                )}
                                                                <span className="material-symbols-outlined text-[18px] translate-y-[0.5px] shrink-0">mic</span>
                                                                <span>Voice message</span>
                                                            </span>
                                                        );
                                                    case 'gif':
                                                        return (
                                                            <span className="flex items-center gap-1">
                                                                {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center">You:</span>
                                                                )}
                                                                {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center"><>{renderTextWithEmojis(room.last_message_sender_name || 'User')}:</></span>
                                                                )}
                                                                {String(room.last_message_sender_id) === String(user.id) && (
                                                                     <span className={`material-symbols-outlined text-[16px] shrink-0 ${
                                                                        room.last_message_status === 'error' ? 'text-red-400' :
                                                                        room.last_message_status === 'seen' ? 'text-blue-500' :
                                                                        'text-slate-400'
                                                                    }`}>
                                                                        {(room.last_message_status === 'sending' || room.last_message_status === 'pending') ? 'access_time' : 
                                                                         room.last_message_status === 'error' ? 'error' :
                                                                         room.last_message_status === 'sent' ? 'check' : 
                                                                         'done_all'}
                                                                    </span>
                                                                )}
                                                                <span className="material-symbols-outlined text-[18px] translate-y-[0.5px] shrink-0">gif_box</span>
                                                                <span>GIF</span>
                                                            </span>
                                                        );
                                                    case 'video':
                                                        return (
                                                            <span className="flex items-center gap-1">
                                                                {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center">You:</span>
                                                                )}
                                                                {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_sender_id && (
                                                                    <span className="shrink-0 inline-flex items-center"><>{renderTextWithEmojis(room.last_message_sender_name || 'User')}:</></span>
                                                                )}
                                                                {String(room.last_message_sender_id) === String(user.id) && (
                                                                     <span className={`material-symbols-outlined text-[16px] shrink-0 ${
                                                                        room.last_message_status === 'error' ? 'text-red-400' :
                                                                        room.last_message_status === 'seen' ? 'text-blue-500' :
                                                                        'text-slate-400'
                                                                    }`}>
                                                                        {(room.last_message_status === 'sending' || room.last_message_status === 'pending') ? 'access_time' : 
                                                                         room.last_message_status === 'error' ? 'error' :
                                                                         room.last_message_status === 'sent' ? 'check' : 
                                                                         'done_all'}
                                                                    </span>
                                                                )}
                                                                <span className="material-symbols-outlined text-[18px] translate-y-[0.5px] shrink-0">videocam</span>
                                                                <span>Video</span>
                                                            </span>
                                                        );
                                                    case 'poll_vote':
                                                        return (
                                                            <span className="flex items-center gap-1">
                                                                <span className="shrink-0">
                                                                    {String(room.last_message_sender_id) === String(user.id) ? 'You' : renderTextWithEmojis(room.last_message_sender_name)}
                                                                </span>
                                                                <span>voted in:</span>
                                                                <PollIcon className="w-4 h-4 shrink-0" />
                                                                <span className="truncate py-0.5 leading-normal">{renderTextWithEmojis(room.last_message_poll_question) || 'Poll'}</span>
                                                            </span>
                                                        );
                                                    case 'poll':
                                                        return (
                                                            <span className="flex items-center gap-1">
                                                                {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_name && (
                                                                   <span className="shrink-0">You:</span>
                                                               )}
                                                               {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_sender_name && (
                                                                   <span className="shrink-0">{renderTextWithEmojis(room.last_message_sender_name)}:</span>
                                                               )}
                                                                {String(room.last_message_sender_id) === String(user.id) && (
                                                                     <span className={`material-symbols-outlined text-[16px] shrink-0 ${
                                                                        room.last_message_status === 'error' ? 'text-red-400' :
                                                                        room.last_message_status === 'seen' ? 'text-blue-500' :
                                                                        'text-slate-400'
                                                                    }`}>
                                                                        {(room.last_message_status === 'sending' || room.last_message_status === 'pending') ? 'access_time' : 
                                                                         room.last_message_status === 'error' ? 'error' :
                                                                         room.last_message_status === 'sent' ? 'check' : 
                                                                         'done_all'}
                                                                    </span>
                                                                )}
                                                                <PollIcon className="w-4 h-4 shrink-0" />
                                                                <span className="truncate py-0.5 leading-normal">{renderTextWithEmojis(room.last_message_poll_question, '1.1em') || 'Poll'}</span>
                                                            </span>
                                                        );
                                                    default:
                                                        if (room.last_message_content && room.last_message_content.includes('pinned a message')) {
                                                            return (
                                                                <span className="flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[16px] translate-y-[0.5px] shrink-0">push_pin</span>
                                                                    <span className="truncate py-0.5 leading-normal">
                                                                        {String(room.last_message_sender_id) === String(user.id) 
                                                                            ? (room.type === 'group' ? 'You pinned a message' : 'Pinned a message')
                                                                            : `${room.last_message_sender_name || 'Someone'} pinned a message`}
                                                                    </span>
                                                                </span>
                                                            );
                                                        }
                                                        return (
                                                            <span className="flex items-center">
                                                                {room.type === 'group' && String(room.last_message_sender_id) === String(user.id) && room.last_message_sender_id && (
                                                                    <span className="mr-1 shrink-0 inline-flex items-center">You:</span>
                                                                )}
                                                                {room.type === 'group' && String(room.last_message_sender_id) !== String(user.id) && room.last_message_type !== 'system' && room.last_message_sender_id && (
                                                                    <span className="mr-1 shrink-0 inline-flex items-center"><>{renderTextWithEmojis(room.last_message_sender_name || 'User')}:</></span>
                                                                )}
                                                                <LastMessagePreview room={room} user={user} hasSkippedSync={hasSkippedSync} />
                                                            </span>
                                                        );
                                                }
                                            })()}
                                        </span>
                                    </div>
                                )}
                            </div>
                            </div>

                            {/* Right Side Column: Menu + Badge */}
                            <div className="flex flex-col items-end gap-1 ml-2">
                                {/* Three-dot Menu Button - Shows on Hover */}
                                {room.type !== 'ai' && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setContextMenu({
                                                visible: true,
                                                x: e.clientX,
                                                y: e.clientY,
                                                room: room
                                            });
                                        }}
                                        className={`w-5 h-5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 flex items-center justify-center transition-all shrink-0 mb-auto cursor-pointer ${
                                            contextMenu.visible && contextMenu.room?.id === room.id 
                                            ? 'opacity-100 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' 
                                            : 'opacity-0 group-hover:opacity-100'
                                        }`}
                                        title="More options"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                                    </div>
                                )}

                                {/* Loading Indicator or Badge - At Bottom */}
                                {loadingRoomId === room.id ? (
                                    <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin"></div>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        {/* Pinned Icon */}
                                        {room.is_pinned && (
                                            <span className="material-symbols-outlined text-[16px] text-slate-400 dark:text-slate-500 transform rotate-45">push_pin</span>
                                        )}
                                         {/* Mention Badge */}
                                         {room.mention_count > 0 && (
                                             <span className="bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center shadow-sm animate-pulse ring-2 ring-white dark:ring-slate-900">
                                                 <span className="material-symbols-outlined text-[14px]">alternate_email</span>
                                             </span>
                                         )}

                                        {room.unread_count > 0 && (
                                            <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-[20px] flex items-center justify-center">
                                                {room.unread_count > 99 ? '99+' : room.unread_count}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                    </div>
                ))
                )}

            </div>

            {/* Context Menu */}
            {contextMenu.visible && (
                <SidebarContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu({ ...contextMenu, visible: false })}
                    options={[
                        !contextMenu.room.is_archived && {
                            label: contextMenu.room.is_pinned ? 'Unpin' : 'Pin',
                            icon: 'push_pin',
                            onClick: async () => {
                                try {
                                    const action = contextMenu.room.is_pinned ? 'unpin' : 'pin';
                                    const token = localStorage.getItem('token');
                                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${contextMenu.room.id}/${action}`, {
                                        method: 'POST',
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    const data = await res.json();
                                    
                                    if (!res.ok) {
                                        if (data.error && (data.error.includes('pin up to 8') || data.error.includes('8 chats'))) {
                                            alert(data.error);
                                        } else {
                                            console.error(data.error);
                                        }
                                        return;
                                    }

                                    // Trigger refresh
                                    if (onRefresh) onRefresh();
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                        },
                        {
                            label: contextMenu.room.is_archived ? 'Unarchive' : 'Archive',
                            icon: contextMenu.room.is_archived ? 'unarchive' : 'inventory_2',
                            onClick: async () => {
                                try {
                                    const action = contextMenu.room.is_archived ? 'unarchive' : 'archive';
                                    const token = localStorage.getItem('token');
                                    await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${contextMenu.room.id}/${action}`, {
                                        method: 'POST',
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    // Trigger refresh
                                    if (onRefresh) onRefresh();
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                        },
                        {
                            label: isRoomLocked(contextMenu.room.id) ? 'Manage Lock' : 'Lock Chat',
                            icon: isRoomLocked(contextMenu.room.id) ? 'lock' : 'lock_open',
                            onClick: () => {
                                setShowChatLockModal(contextMenu.room);
                            }
                        }
                    ].filter(Boolean)}
                />
            )}

            {/* Actions */}
            <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-900/30 space-y-3 transition-colors duration-300">
                {tab === 'ai' ? (
                   <div className="text-center text-xs text-slate-400">
                       AI Assistant is ready
                   </div>
                ) : (
                    <>
                        <button 
                            onClick={onCreateRoom}
                            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 transition-all duration-200 transform hover:scale-[1.02]"
                        >
                            <span className="material-symbols-outlined text-lg">add_circle</span>
                            New Room
                        </button>
                        <button 
                            onClick={onJoinRoom}
                            className="w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 transition-all duration-200 transform hover:scale-[1.02]"
                        >
                            <span className="material-symbols-outlined text-lg">login</span>
                            Join Room
                        </button>
                    </>
                )}
            </div>

            
            {showShareProfile && (
                <ProfileShareModal 
                    user={user} 
                    onClose={() => setShowShareProfile(false)} 
                />
            )}



            {/* Chat Lock Modal */}
            {showChatLockModal && (
                <ChatLockModal
                    room={showChatLockModal}
                    onClose={() => setShowChatLockModal(null)}
                    onLockSet={(roomId) => {
                        if (onRoomLocked) onRoomLocked(roomId);
                    }}
                />
            )}
        </div>
    );
}

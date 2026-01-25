import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { useCall } from '../context/CallContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ProfilePanel from './ProfilePanel';
import { useNotification } from '../context/NotificationContext';
import ImagePreviewModal from './ImagePreviewModal';
import FilePreviewModal from './FilePreviewModal';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import LocationPicker from './LocationPicker';
import CreatePollModal from './CreatePollModal';
import CreateTodoModal from './CreateTodoModal';
import PinDurationModal from './PinDurationModal';
import { linkifyText } from '../utils/linkify';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import db, { saveLocalMessage, updateLocalMessage, deleteLocalMessage, saveFetchedMessages } from '../utils/db';
import SelectionBar from './SelectionBar';
import { cryptoManager } from '../lib/crypto/CryptoManager';
import { decryptPayload, normalizeReplies } from '../utils/messageHydrator';
import { useConfirm } from '../context/ConfirmationContext';
import ChatSkeleton from './ChatSkeleton';

// [NEW] Helper to convert blobs to PNG for Clipboard API compatibility
const convertToPng = (blob) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((pngBlob) => {
                URL.revokeObjectURL(url);
                if (pngBlob) resolve(pngBlob);
                else reject(new Error('Canvas toBlob failed'));
            }, 'image/png');
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
};

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

export default function ChatWindow({ 
    socket, 
    room, 
    user, 
    onBack, 
    showGroupInfo, 
    setShowGroupInfo, 
    isLoading, 
    highlightMessageId, 
    onGoToMessage, 
    onRefresh, 
    onMessageSent, 
    onMessageStatusUpdate, 
    onOptimisticReaction, // [NEW]
    justRestored, // [NEW]
    hasSkippedSync, // [NEW]
    onRestoreAnimationComplete, // [NEW]

    typingByRoom, // [NEW]
    onOpenMainProfile, // [NEW]
    onOpenProfile, // [NEW]
}) {
    const { token } = useAuth();
    const { presenceMap, fetchStatuses } = usePresence();
    const { showNotification } = useNotification();
    const { initiateCall } = useCall();


    // [NEW] Capture restore state on mount
    // We utilize the fact that ChatWindow is remounted on room change (key={room.id} in parent)
    const [isRestoreAnimation, setIsRestoreAnimation] = useState(justRestored);
    
    // [DEXIE] messages comes from useLiveQuery
    // [FIX] Removed '|| []' to distinguish between 'loading' (undefined) and 'empty' ([])
    const messages = useLiveQuery(
        () => db.messages.where('room_id').equals(String(room.id)).sortBy('created_at'),
        [room.id]
    );

    // [NEW] Cache for Sender Signing Keys (deviceId -> publicKey)
    const senderDeviceKeys = useRef(new Map());
    const lastTimestampRef = useRef(0); // [NEW] For strictly monotonic optimistic timestamps
    // [NEW] Replay Protection
    const seenMessages = useRef(new Set());
    const deviceLastTimestamp = useRef(new Map());
    
    // [NEW] Caches to prevent "chaining" and redundant fetches
    const roomDevicesCache = useRef(new Map()); // roomId -> { devices, timestamp }
    const roomKeyExistsCache = useRef(new Map()); // roomId -> { exists, latestVersion, timestamp }
    const roomMyKeyCache = useRef(new Map()); // roomId -> { keyData, timestamp }
    
    // [NEW] Chat Hydration Control - Prevents flash of old messages
    // [FIX] Start as NOT ready to ensure we wait for hydration/Dexie
    const [isChatReady, setIsChatReady] = useState(false);
    const activeChatIdRef = useRef(room.id);
    const hasHydratedRef = useRef(!!room.initialMessages);

    useEffect(() => {
        if (justRestored && isChatReady && onRestoreAnimationComplete) {
            // [MODIFIED] Only clear/complete once messages are decrypted and ready
            // We add a tiny extra delay for the modal to show "Success" state
            const timer = setTimeout(() => {
                onRestoreAnimationComplete();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [justRestored, isChatReady, onRestoreAnimationComplete]);

    // [CRITICAL] Hard Reset on Room Change - Prevents flash of old messages
    useEffect(() => {
        // Track current room ID for stale response detection
        activeChatIdRef.current = room.id;
        
        // [FIX] Reset ready state to false on room change
        setIsChatReady(false);
        
        if (!room.initialMessages) {
             hasHydratedRef.current = false;
             // If we rely on existing Dexie data (no fresh sync), we are effectively "ready" regarding hydration,
             // but we still wait for useLiveQuery (messages !== undefined) in render.
             // We'll let the main hydration effect handle the ready flip for consistency.
             setHasMore(true);
             setLoadingMore(false);
        }
    }, [room.id]); // [FIX] Removed room.initialMessages dependency to prevent resets on prop updates

    const [isExpired, setIsExpired] = useState(false);
    const [replyTo, setReplyTo] = useState(null); 
    const [editingMessage, setEditingMessage] = useState(null);
    const [selectedImages, setSelectedImages] = useState(null);
    const [selectedFiles, setSelectedFiles] = useState(null);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [showCreatePoll, setShowCreatePoll] = useState(false);
    const [showCreateTodo, setShowCreateTodo] = useState(false);
    const [pinToConfirm, setPinToConfirm] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState(new Set());
    const [chatPreferences, setChatPreferences] = useState({}); // [NEW] Chat Preferences
    
    // [NEW] Unread/Divider State
    const [lastReadMessageId, setLastReadMessageId] = useState(room.last_read_message_id || null);
    const [isAtBottom, setIsAtBottom] = useState(true); // Default to true unless history loaded? Actually safest is false until confirmed
    
    // [NEW] Frozen Divider - Snapshot logic to keep divider stable until user leaves chat
    // This captures the lastReadMessageId on mount and doesn't update until room changes
    const [frozenDividerMessageId, setFrozenDividerMessageId] = useState(room.last_read_message_id || null);
    
    useEffect(() => {
        setLastReadMessageId(room.last_read_message_id || null);
        // [NEW] Reset frozen divider on room change (fresh snapshot)
        setFrozenDividerMessageId(room.last_read_message_id || null);
    }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // [FIX] Clear frozen divider if all messages have been read (handles stale prop issue)
    // This runs once when messages load to check if there are actually any unread
    useEffect(() => {
        if (!messages || messages.length === 0 || !frozenDividerMessageId) return;
        
        const lastMsg = messages[messages.length - 1];
        // If the frozen divider ID >= last message ID, there are no unread messages
        // (This happens when user read everything but room.last_read_message_id prop is stale)
        if (lastMsg && (frozenDividerMessageId >= lastMsg.id || String(frozenDividerMessageId) >= String(lastMsg.id))) {
            setFrozenDividerMessageId(null); // No divider needed
        }
    }, [messages, frozenDividerMessageId]);

    useEffect(() => {
        if (!socket) return;
        const handleReadUpdate = ({ chatId, lastReadMessageId: newId }) => {
            if (String(chatId) === String(room.id)) {
                setLastReadMessageId(newId);
            }
        };
        
        // [NEW] Handle Star/Unstar real-time updates
        const handleStarUpdate = async ({ messageId, roomId, isStarred }) => {
            console.log('[DEBUG-CLIENT] handleStarUpdate received:', { messageId, roomId, isStarred, currentRoomId: room.id });
            if (String(roomId) === String(room.id)) {
                 await updateLocalMessage(messageId, { is_starred: isStarred });
            } else {
                console.log('[DEBUG-CLIENT] Room ID mismatch:', roomId, room.id);
            }
        };

        socket.on('chat:read-update', handleReadUpdate);
        socket.on('message_starred', handleStarUpdate);
        
        return () => {
            socket.off('chat:read-update', handleReadUpdate);
            socket.off('message_starred', handleStarUpdate);
        };
    }, [socket, room.id]);

    const markAsRead = useCallback(() => {
         if (!messages || !messages.length) return;
         const lastMsg = messages[messages.length - 1];
         // Only mark if we have a NEWER message than what we last read
         // and the last message is NOT mine (optional, but good for data cleanliness, though WhatsApp marks mine as read too implicitly)
         // Actually, simply update the pointer to the latest message ID available.
         if (lastMsg.id !== lastReadMessageId) {
             console.log('Marking as read:', lastMsg.id);
             socket.emit('chat:mark-read', { chatId: room.id, lastReadMessageId: lastMsg.id });
             // Optimistic update
             setLastReadMessageId(lastMsg.id);
         }
    }, [messages, lastReadMessageId, room.id, socket]);

    // Window Focus Handler
    useEffect(() => {
        const handleFocus = () => {
            if (isAtBottom) markAsRead();
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [isAtBottom, markAsRead]);

    // [NEW] Delete Selection Modal State
    const [deleteSelectionModal, setDeleteSelectionModal] = useState({ isOpen: false, count: 0, canDeleteForEveryone: false });

    const [isBlockedByMe, setIsBlockedByMe] = useState(room.is_blocked_by_me || false);
    const [isBlockedByThem, setIsBlockedByThem] = useState(room.is_blocked_by_them || false);
    const [otherUserId, setOtherUserId] = useState(room.other_user_id || null);
    const [checkingBlockStatus, setCheckingBlockStatus] = useState(false);

    // [NEW] Sync state with props (if parent updates room object)
    useEffect(() => {
        setIsBlockedByMe(room.is_blocked_by_me || false);
        setIsBlockedByThem(room.is_blocked_by_them || false);
    }, [room.is_blocked_by_me, room.is_blocked_by_them]);

    // [NEW] Refs to access latest values in socket handlers (avoid stale closure)
    const isBlockedByMeRef = useRef(isBlockedByMe);
    const otherUserIdRef = useRef(otherUserId);
    const isAtBottomRef = useRef(isAtBottom); // [NEW] Track bottom state ref
    
    useEffect(() => { isBlockedByMeRef.current = isBlockedByMe; }, [isBlockedByMe]);
    useEffect(() => { otherUserIdRef.current = otherUserId; }, [otherUserId]);
    useEffect(() => { isAtBottomRef.current = isAtBottom; }, [isAtBottom]);

    // Fetch Block Status for Direct Chats (Background Sync)
    useEffect(() => {
        if (room.type === 'direct') {
            // If we don't have otherUserId from prop, find it
            if (!otherUserId) {
                 const fetchMembers = async () => {
                    try {
                        const membersRes = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members`, { 
                            headers: { Authorization: `Bearer ${token}` } 
                        });
                        if (membersRes.ok) {
                            const members = await membersRes.json();
                            const otherMember = members.find(m => m.user_id !== user.id); 
                            if (otherMember) {
                                setOtherUserId(otherMember.user_id);
                            }
                        }
                    } catch (e) { console.error(e); }
                 };
                 fetchMembers();
            }

            // Sync block status in background (don't show spinner)
            const fetchBlockStatus = async () => {
                try {
                    let targetId = otherUserId || room.other_user_id; 
                    if (targetId) {
                        const blockRes = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me/blocked`, { 
                            headers: { Authorization: `Bearer ${token}` } 
                        });
                        if (blockRes.ok) {
                            const blockedList = await blockRes.json();
                            const isBlocked = blockedList.some(b => b.id === targetId);
                            // Only update if different to avoid re-renders
                            if (isBlocked !== isBlockedByMe) {
                                setIsBlockedByMe(isBlocked);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Failed to check block status", e);
                }
            };
            fetchBlockStatus();
        } else {
            setIsBlockedByMe(false);
            setOtherUserId(null);
        }
    }, [room.id, user.id, room.is_blocked_by_me, room.other_user_id]);

    const handleUnblock = async () => {
        if (!otherUserId) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me/unblock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ targetUserId: otherUserId })
            });
            if (res.ok) {
                setIsBlockedByMe(false);
                if (onRefresh) onRefresh();
            }
        } catch (e) {
            console.error(e);
        }
    };



    // [DEPRECATED] use normalizeReplies from utils/messageHydrator

    const handleLoadOlderMessages = async () => {
        if (loadingMore || !hasMore || !messages || messages.length === 0) return;

        setLoadingMore(true);
        const oldestMsg = messages[0];
        const oldestId = oldestMsg.created_at; 

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages?limit=50&before=${oldestId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const rawMessages = await res.json();
                
                // 1. Decrypt all
                const decrypted = await Promise.all(rawMessages.map(m => decryptPayload(m)));
                
                // 2. Hydrate replies
                const hydratedMessages = normalizeReplies(decrypted, messages);
                 
                if (hydratedMessages.length < 50) {
                    setHasMore(false);
                }

                if (hydratedMessages.length > 0) {
                    // 3. Persist to Dexie
                    await saveFetchedMessages(hydratedMessages);
                }
            }
        } catch (err) {
            console.error("Failed to load older messages", err);
        } finally {
            setLoadingMore(false);
        }
    };

    const headerRef = useRef(null);

    // Restriction Logic
    const [showPrivilegedModal, setShowPrivilegedModal] = useState(false);
    const [privilegedModalConfig, setPrivilegedModalConfig] = useState({ title: '', roles: [] });

    const myRole = room.role || 'member';
    const sendMode = room.send_mode || 'everyone';

    const canSend = (() => {
        // [FIX] Priority: Direct chats always allow messages. 
        // Logic is mirrored on server: only group rooms check group_permissions.
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
        const confirmed = await confirm({
            title: 'Leave Group',
            message: 'Are you sure you want to leave this group?',
            type: 'danger',
            confirmText: 'Leave'
        });
        if (!confirmed) return;
        
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

    // [NEW] Scroll to validated message with Retries
    useEffect(() => {
        if (highlightMessageId) {
            let attempts = 0;
            const maxAttempts = 15; // Try for ~3 seconds/
            
            const tryScroll = () => {
                const element = document.getElementById(`msg-${highlightMessageId}`);
                if (element) {
                    console.log('[Nav] Found target message, scrolling...', highlightMessageId);
                    scrollToMatch(highlightMessageId);
                    // Also flash it again just in case
                    return;
                }
                
                attempts++;
                if (attempts < maxAttempts) {
                    console.log(`[Nav] Target ${highlightMessageId} not found, retrying... (${attempts})`);
                    setTimeout(tryScroll, 200);
                } else {
                    console.warn('[Nav] Failed to find target message after retries:', highlightMessageId);
                }
            };

            // Start trying immediately (next tick)
            setTimeout(tryScroll, 100);
        }
    }, [highlightMessageId]);

    // [CRITICAL] Single-Hydration & Update Pattern
    useEffect(() => {
        // [FIX] Robust ID comparison
        if (String(activeChatIdRef.current) !== String(room.id)) {
            return;
        }
        
        // [NEW] Stale Guard for async decryption
        let isStale = false;

        // If we have initial messages, hydrate and save them
        if (room.initialMessages) {
            Promise.all(room.initialMessages.map(m => decryptPayload(m))).then(async (decrypted) => {
                if (isStale) return; 

                const hydrated = normalizeReplies(decrypted, []);
                const toSave = hydrated.map(m => ({ 
                    ...m, 
                    room_id: String(room.id)
                    // [FIX] Don't force isDecrypted: true. decryptPayload sets it if successful.
                }));
                
                await saveFetchedMessages(toSave);
                
                // Mark as ready ONLY after hydration is done
                if (!isStale) setIsChatReady(true);
            });
        } else if (justRestored) {
            // [NEW] If we just restored keys, re-decrypt the messages in the current room
            (async () => {
                try {
                    const localMsgs = await db.messages.where('room_id').equals(String(room.id)).toArray();
                    const encrypted = localMsgs.filter(m => !m.isDecrypted);
                    
                    if (encrypted.length > 0) {
                        console.log(`[Restore] Re-decrypting ${encrypted.length} messages for room ${room.id}`);
                        const decrypted = await Promise.all(encrypted.map(async (m) => {
                            const d = await decryptPayload(m);
                            // [FIX] Don't force isDecrypted: true. Trust d.isDecrypted from decryptPayload.
                            return { ...m, ...d }; // Ensure we keep original fields like id
                        }));
                        await db.messages.bulkPut(decrypted);
                    }
                } catch (err) {
                    console.error('[Restore] Re-decryption failed:', err);
                } finally {
                    if (!isStale) setIsChatReady(true);
                }
            })();
        } else {
            // No hydration needed, ready immediately (but useLiveQuery may still be loading)
            setIsChatReady(true);
        }

        return () => {
             isStale = true;
        };
    }, [room.initialMessages, room.id, justRestored]); // [FIX] Added justRestored dependency

    // [NEW] Listen for keys-updated event to re-decrypt messages after backup restore
    useEffect(() => {
        const handleKeysUpdated = async (event) => {
            console.log('[ChatWindow] Keys updated event received, re-decrypting messages...');
            
            try {
                // Get all messages for this room from IndexedDB
                const localMsgs = await db.messages.where('room_id').equals(String(room.id)).toArray();
                
                // Find messages that need decryption:
                // - Has ciphertext (encrypted)
                // - Not already decrypted OR has no content
                const needsDecryption = localMsgs.filter(m => 
                    m.ciphertext && m.iv && (!m.isDecrypted || !m.content || m.content === '')
                );
                
                console.log(`[ChatWindow] Found ${localMsgs.length} total msgs, ${needsDecryption.length} need decryption`);
                
                if (needsDecryption.length === 0) {
                    console.log('[ChatWindow] No messages need decryption');
                    return;
                }
                
                console.log(`[ChatWindow] Re-decrypting ${needsDecryption.length} messages for room ${room.id}`);
                
                // Decrypt all messages
                const decrypted = await Promise.all(needsDecryption.map(async (m) => {
                    try {
                        const d = await decryptPayload(m);
                        console.log(`[ChatWindow] Message ${m.id}: decrypted=${d.isDecrypted}, hasContent=${!!d.content}`);
                        return { ...m, ...d }; // Merge keeping original fields like id
                    } catch (err) {
                        console.error(`[ChatWindow] Failed to decrypt message ${m.id}:`, err);
                        return m; // Return original if decrypt fails
                    }
                }));
                
                // Filter only successfully decrypted ones
                const successfullyDecrypted = decrypted.filter(m => m.isDecrypted && m.content);
                
                console.log(`[ChatWindow] Successfully decrypted ${successfullyDecrypted.length} of ${needsDecryption.length} messages`);
                
                if (successfullyDecrypted.length > 0) {
                    // Update IndexedDB with decrypted messages
                    await db.messages.bulkPut(successfullyDecrypted);
                    console.log('[ChatWindow] Updated IndexedDB with decrypted messages');
                }
            } catch (err) {
                console.error('[ChatWindow] Re-decryption after key update failed:', err);
            }
        };
        
        window.addEventListener('cipher:keys-updated', handleKeysUpdated);
        return () => window.removeEventListener('cipher:keys-updated', handleKeysUpdated);
    }, [room.id]);

    // [CRITICAL] Scroll ONLY after chat is ready - prevents scroll jumps


    // [NEW] Fetch Chat Preferences & Listen for Updates
    useEffect(() => {
        if (!room?.id || !socket) return;
        
        const cacheKey = `chat_prefs_${user.id}_${room.id}`;

        // 1. Load from Cache immediately
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                setChatPreferences(JSON.parse(cached));
            } catch (e) {
                console.error("Failed to parse cached prefs");
            }
        }

        // 2. Fetch Fresh
        const fetchPreferences = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/rooms/${room.id}/preferences`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setChatPreferences(data);
                    // Update Cache
                    localStorage.setItem(cacheKey, JSON.stringify(data));
                }
            } catch (err) {
                console.error("Failed to fetch chat preferences", err);
            }
        };

        fetchPreferences();

        // Socket Listener
        const handlePreferencesUpdated = ({ roomId, bubbleColor, wallpaper }) => {
            if (String(roomId) === String(room.id)) {
                setChatPreferences(prev => {
                    const next = { ...prev, bubbleColor, wallpaper };
                    localStorage.setItem(cacheKey, JSON.stringify(next));
                    return next;
                });
            }
        };

        socket.on('chat:preferences_updated', handlePreferencesUpdated);
        return () => socket.off('chat:preferences_updated', handlePreferencesUpdated);

    }, [room?.id, socket, token, user.id]);

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

        const handleNewMessage = async (msg) => {
            // [IGNORE] persistence logic here; Dashboard.jsx handles global saving to Dexie.
            // This listener now ONLY handles ChatWindow-specific UI side effects.

            if (String(msg.room_id) !== String(room.id)) return;
            
            // Replay protection (local check is still good for immediate feedback)
            const gatekeeperId = msg.sender_device_id ? `${msg.sender_device_id}:${msg.temp_id}` : `unsigned:${msg.temp_id || msg.id}`;
            if (seenMessages.current.has(gatekeeperId)) return;
            seenMessages.current.add(gatekeeperId);

            // Mark as read if window is focused and at bottom
            if (msg.user_id !== user.id) {
                if (isAtBottomRef.current && document.visibilityState === 'visible') {
                    socket.emit('chat:mark-read', { chatId: room.id, lastReadMessageId: msg.id });
                    setLastReadMessageId(msg.id); 
                }
            }
        };

        const handleStatusUpdate = () => {}; // [DEPRECATED] Dashboard handles this
        const handleMessageDelivered = () => {}; // [DEPRECATED] Dashboard handles this
        const handleReadReceipt = () => {}; // [DEPRECATED] Dashboard handles this
        const handleMessageDeleted = () => {}; // [DEPRECATED] Dashboard handles this

        const handleMessageEdited = () => {}; // [DEPRECATED] Dashboard handles this
        const handleMessageViewed = () => {}; // [DEPRECATED] Dashboard handles this

        const handleReactionUpdate = () => {}; // [DEPRECATED] Dashboard handles this

        socket.on('message:reaction_update', handleReactionUpdate);




        socket.on('new_message', handleNewMessage);
        socket.on('messages_status_update', handleStatusUpdate);
        socket.on('message_deleted', handleMessageDeleted);
        socket.on('message_edited', handleMessageEdited);
        socket.on('message_viewed', handleMessageViewed);


        // [NEW] Pin Events
        socket.on('message_pinned', async ({ messageId, roomId, pinnedBy }) => {
             if (String(roomId) === String(room.id)) {
                 await updateLocalMessage(messageId, { is_pinned: true, pinned_by: pinnedBy });
             }
        });

        socket.on('message_unpinned', async ({ messageId, roomId }) => {
             if (String(roomId) === String(room.id)) {
                 await updateLocalMessage(messageId, { is_pinned: false, pinned_by: null });
             }
        });




        // Poll vote update - use named handler so cleanup doesn't remove Dashboard's listener
        const handlePollVote = async (data) => {
            const { pollId, roomId, poll, voterId, voterName, pollQuestion, hasVoted } = data;
            if (String(roomId) === String(room.id)) {
                const msg = await db.messages.where('poll.id').equals(pollId).first();
                if (msg) {
                    let myUserVotes = msg.poll.user_votes;
                    if (String(voterId) === String(user.id)) {
                         myUserVotes = poll.user_votes;
                    } 
                    await updateLocalMessage(msg.id, { 
                        poll: { ...poll, user_votes: myUserVotes }
                    });
                }
            }
        };
        socket.on('poll_vote', handlePollVote);

        // Poll closed - use named handler for proper cleanup
        const handlePollClosed = async ({ pollId, roomId, poll }) => {
            if (String(roomId) === String(room.id)) {
                const msg = await db.messages.where('poll.id').equals(pollId).first();
                if (msg) await updateLocalMessage(msg.id, { poll });
            }
        };

        // [NEW] Todo updated
        const handleTodoUpdated = async ({ todoId, messageId, todo }) => {
             // Update local message state
             if (messageId) {
                 await updateLocalMessage(messageId, { todo });
             }
        };
        
        socket.on('todo_updated', handleTodoUpdated); 
        socket.on('poll_vote', handlePollVote);
        socket.on('poll_closed', handlePollClosed);
        socket.on('poll_closed', handlePollClosed);

        // [NEW] Update messages when a user changes their display name
        const handleProfileUpdate = async ({ userId, display_name }) => {
            // Bulk update messages from this user in Dexie
            await db.messages.where('user_id').equals(String(userId)).modify({ display_name });
            
            // Also need to update reactions potentially? 
            // reactions are an array, Dexie modify is trickier for deep arrays without a full scan
            // For now, let's focus on message sender name.
            
            setMembers(prev => prev.map(m => {
                if (String(m.id) === String(userId) || String(m.user_id) === String(userId)) {
                    return { ...m, display_name };
                }
                return m;
            }));
        };

        const handleAvatarUpdate = async ({ userId, avatar_url, avatar_thumb_url }) => {
            await db.messages.where('user_id').equals(String(userId)).modify({ avatar_url, avatar_thumb_url });

            setMembers(prev => prev.map(m => {
                if (String(m.id) === String(userId) || String(m.user_id) === String(userId)) {
                    return { ...m, avatar_url, avatar_thumb_url };
                }
                return m;
            }));
        };

        const handleAvatarDelete = async ({ userId }) => {
            await db.messages.where('user_id').equals(String(userId)).modify({ avatar_url: null, avatar_thumb_url: null });

            setMembers(prev => prev.map(m => {
                if (String(m.id) === String(userId) || String(m.user_id) === String(userId)) {
                    return { ...m, avatar_url: null, avatar_thumb_url: null };
                }
                return m;
            }));
        };

        socket.on('user:profile:updated', handleProfileUpdate);
        socket.on('user:avatar:updated', handleAvatarUpdate);
        socket.on('user:avatar:deleted', handleAvatarDelete);

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

        // [NEW] Handle real-time block/unblock (to update online status visibility)
        const handleYouAreBlocked = ({ blockerId }) => {
            if (otherUserIdRef.current && String(blockerId) === String(otherUserIdRef.current)) {
                setIsBlockedByThem(true);
            }
        };

        const handleYouAreUnblocked = ({ blockerId }) => {
            if (otherUserIdRef.current && String(blockerId) === String(otherUserIdRef.current)) {
                setIsBlockedByThem(false);
            }
        };

        // [NEW] Handle Chat Cleared
        const handleChatCleared = async ({ roomId }) => {
            if (String(roomId) === String(room.id)) {
                console.log('[ChatWindow] Chat cleared, wiping local DB.');
                await db.messages.where('room_id').equals(String(roomId)).delete();
                setHasMore(false);
                localStorage.removeItem(`chat_messages_${room.id}`);
            }
        };

        // [NEW] Handle Key Arrival (Auto-decrypt waiting messages)
        const handleNewKey = async ({ roomId, key, version }) => {
            if (String(roomId) === String(room.id)) {
                console.log('[ChatWindow] New key arrived, saving and retrying decryption...');
                // Save key first
                if (key && version) {
                    try {
                        const importedKey = await cryptoManager.importRoomKey(cryptoManager.base64ToArrayBuffer(key)); // Assume key is exported format? No, usually encrypted.
                        // Wait, server usually sends encrypted key if it's dist? Or raw if it's my own?
                        // Actually, 'room:key' event structure depends on server.
                        // Assuming the event tells us TO FETCH, or sends the key.
                        
                        // If it's just a notification "New Key Available", we should fetch.
                        // If it contains the key, we save.
                        
                        // Simplest approach: Just trigger a soft reload of messages which will re-fetch keys if needed.
                        loadMessages(true); 
                    } catch (e) {
                         console.error('Auto-key save failed', e);
                         loadMessages(true); // Retry anyway
                    }
                } else {
                     loadMessages(true); 
                }
            }
        };

        socket.on('you_are_blocked', handleYouAreBlocked);
        socket.on('you_are_unblocked', handleYouAreUnblocked);
        socket.on('chat:cleared', handleChatCleared);
        socket.on('room:key', handleNewKey);
        socket.on('message:delivered', handleMessageDelivered); // [NEW]
        socket.on('message:read_receipt', handleReadReceipt); // [NEW]
        socket.on('message_viewed', handleMessageViewed); // [NEW]

        return () => {
            socket.off('new_message', handleNewMessage);
            socket.off('messages_status_update', handleStatusUpdate);
            socket.off('message_deleted', handleMessageDeleted);
            socket.off('message_edited', handleMessageEdited);
            socket.off('message_viewed', handleMessageViewed);
            socket.off('chat:cleared', handleChatCleared); 
            socket.off('room:key', handleNewKey); // [NEW] 
            socket.off('poll_vote', handlePollVote);
            socket.off('poll_closed', handlePollClosed);
            socket.off('user:profile:updated', handleProfileUpdate);
            socket.off('user:avatar:updated', handleAvatarUpdate);
            socket.off('user:avatar:deleted', handleAvatarDelete);
            socket.off('group:member:added', handleMemberAdded);
            socket.off('group:member:removed', handleMemberRemoved);
            socket.off('you_are_blocked', handleYouAreBlocked);
            socket.off('you_are_blocked', handleYouAreBlocked);
            socket.off('you_are_unblocked', handleYouAreUnblocked);
            socket.off('message:reaction_update', handleReactionUpdate);
            socket.off('message:read_receipt', handleReadReceipt); // [NEW]
            socket.off('message_viewed', handleMessageViewed); // [NEW]
        };
    }, [socket, room, token]);

    const handleLocalDelete = async (messageId) => {
        await deleteLocalMessage(messageId);
    };

    // [NEW] Selection Mode Handlers
    const toggleSelectionMode = (initialMsgId) => {
        setIsSelectionMode(true);
        if (initialMsgId) {
            setSelectedMessageIds(new Set([initialMsgId]));
        }
    };

    const toggleMessageSelection = (msgId) => {
        setSelectedMessageIds(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) {
                next.delete(msgId);
            } else {
                next.add(msgId);
            }
            // Optional: Auto-exit if empty? WhatsApp keeps mode even if 0 selected until Back pressed.
            return next;
        });
    };

    const handleCancelSelection = () => {
        setIsSelectionMode(false);
        setSelectedMessageIds(new Set());
    };

    // [NEW] Copy Logic
    const canCopy = React.useMemo(() => {
        if (selectedMessageIds.size === 0) return false;
        const selected = messages.filter(m => selectedMessageIds.has(m.id));
        return selected.every(m => {
            if (m.type === 'audio' || m.type === 'file') return false;
            // Image validation: allow if it has attachments or direct image_url (implies accessible)
            if (m.type === 'image') return !!(m.image_url || (m.attachments && m.attachments.length > 0));
            return true; 
        });
    }, [selectedMessageIds, messages]);

    const handleCopySelectedMessages = async () => {
        const selected = messages
            .filter(m => selectedMessageIds.has(m.id))
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const textParts = [];
        const clipboardItems = [];

        try {
            // 1. Process all messages
            for (const msg of selected) {
                if (msg.type === 'image') {
                    // Handle multi-image messages (attachments) or single
                    const imagesToFetch = msg.attachments && msg.attachments.length > 0 
                        ? msg.attachments 
                        : (msg.image_url ? [{ url: msg.image_url }] : []);
                    
                    for (const img of imagesToFetch) {
                        try {
                            // Try direct fetch first
                            const response = await fetch(img.url, { mode: 'cors' });
                            if (!response.ok) throw new Error('Direct fetch failed');
                            const blob = await response.blob();
                            
                            // [FIX] Convert to PNG if needed for clipboard support
                            if (blob.type !== 'image/png') {
                                const pngBlob = await convertToPng(blob);
                                clipboardItems.push(new ClipboardItem({ 'image/png': pngBlob }));
                            } else {
                                clipboardItems.push(new ClipboardItem({ [blob.type]: blob }));
                            }
                        } catch (e) {
                            console.warn("Direct image copy failed, trying proxy...", e);
                            try {
                                // Fallback to proxy
                                const proxyUrl = `${import.meta.env.VITE_API_URL}/api/messages/proxy-download?url=${encodeURIComponent(img.url)}`;
                                const response = await fetch(proxyUrl, { 
                                    headers: { Authorization: `Bearer ${token}` }
                                });
                                const blob = await response.blob();
                                // [FIX] Clipboard API usually requires image/png
                                if (blob.type !== 'image/png') {
                                    const pngBlob = await convertToPng(blob);
                                    clipboardItems.push(new ClipboardItem({ 'image/png': pngBlob }));
                                } else {
                                    clipboardItems.push(new ClipboardItem({ [blob.type]: blob }));
                                }
                            } catch (proxyErr) {
                                console.error("Proxy image copy failed", proxyErr);
                            }
                        }
                    }
                    if (msg.caption) textParts.push(msg.caption);
                } else if (msg.content) {
                     // Check for link messages, render text with emojis is just text
                     textParts.push(msg.content);
                }
            }

            // 2. Add text item if exists
            if (textParts.length > 0) {
                const fullText = textParts.join('\n');
                clipboardItems.push(
                    new ClipboardItem({
                        "text/plain": new Blob([fullText], { type: "text/plain" }),
                    })
                );
            }

            // 3. Write to clipboard
             if (clipboardItems.length > 0) {
                 // Note: Writing multiple disparate items (images + text) usually only works if they are distinct "files" or if browser supports mixed content.
                 // We try best effort.
                await navigator.clipboard.write(clipboardItems);
                // Optional: showtoast
            }
            
            handleCancelSelection();
        } catch (err) {
            console.error("Copy failed", err);
            // Fallback: Try Text Only if mixing failed
            if (textParts.length > 0) {
                try {
                    await navigator.clipboard.writeText(textParts.join('\n'));
                    handleCancelSelection();
                } catch (e) { alert("Failed to copy"); }
            } else {
                 alert("Failed to copy images. Ensure HTTPS and CORS.");
            }
        }
    };

    const handleDeleteSelected = () => {
        if (selectedMessageIds.size === 0) return;

        const msgsToDelete = messages.filter(m => selectedMessageIds.has(m.id));
        
        // Determine ownership (all mine? ensure no AI/System messages if checking "mine")
        // System messages usually don't have user_id equal to user.id, so simple check is enough.
        const allMine = msgsToDelete.every(m => m.user_id === user.id && !m.isStreaming);
        
        setDeleteSelectionModal({
            isOpen: true,
            count: selectedMessageIds.size,
            canDeleteForEveryone: allMine
        });
    };

    const handleConfirmDeleteSelection = async (deleteForEveryone) => {
        const idsToCheck = Array.from(selectedMessageIds);
        setDeleteSelectionModal({ isOpen: false, count: 0, canDeleteForEveryone: false }); // Close immediately

        try {
            await Promise.all(idsToCheck.map(async (id) => {
                if (deleteForEveryone) {
                     await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${id}/for-everyone`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                     });
                     // Socket usually handles broadcast, but for immediate local update if needed:
                } else {
                    await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${id}/for-me`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                }
            }));
            
            // Perform local cleanup only for "Delete for me" (Socket handles "Everyone")
            // Actually, safe to just clear selection. 
            // If "Everyone", the `message_deleted` event will come and remove them/update content.
            // If "For Me", we need to remove them locally.
            if (!deleteForEveryone) {
                 for (const id of idsToCheck) {
                     await deleteLocalMessage(id);
                 }
            }
            
            handleCancelSelection();
        } catch (err) {
            console.error("Bulk delete failed", err);
            alert("Failed to delete some messages");
        }
    };

    // [NEW] Clear selection on room change
    useEffect(() => {
        handleCancelSelection();
    }, [room.id]);


    const handleReact = async (messageId, reaction) => {
        const targetMsg = messages.find(m => String(m.id) === String(messageId));
        if (!targetMsg) return;

        const newReaction = {
            userId: user.id,
            reaction,
            created_at: new Date().toISOString()
        };

        const otherReactions = (targetMsg.reactions || []).filter(r => String(r.userId) !== String(user.id) && String(r.user_id) !== String(user.id));
        const nextReactions = [...otherReactions, newReaction];

        // 1. Persist to DB (Optimistic) - Instantly updates UI via useLiveQuery
        await updateLocalMessage(messageId, { reactions: nextReactions });

        // 2. Optimistic Sidebar Update
        if (onOptimisticReaction) {
            onOptimisticReaction(room.id, targetMsg, reaction);
        }

        // 3. Emit Socket Event
        socket.emit('message:react', {
            messageId,
            roomId: room.id,
            reaction
        });
    };

    const handleUnreact = async (messageId) => {
        const targetMsg = messages.find(m => String(m.id) === String(messageId));
        if (!targetMsg) return;

        const nextReactions = (targetMsg.reactions || []).filter(r => String(r.userId) !== String(user.id) && String(r.user_id) !== String(user.id));

        // 1. Persist to DB (Optimistic)
        await updateLocalMessage(messageId, { reactions: nextReactions });

        // 2. Optimistic Sidebar Update
        if (onOptimisticReaction) {
            onOptimisticReaction(room.id, targetMsg, null);
        }

        // 3. Emit Socket Event
        socket.emit('message:unreact', {
            messageId,
            roomId: room.id
        });
    };

    const handleSend = async (content, mention_user_ids, replyToMsg) => {
        if (!isExpired) {
            // [FIX] Use state replyTo if not passed as arg
            const finalReplyTo = replyToMsg || replyTo;

            // [NEW] Use UUID for Replay Protection
            const tempId = crypto.randomUUID(); 
            const isOffline = !navigator.onLine;

            // [FIX] Strictly Monotonic Timestamp for ordering
            const now = Date.now();
            const nextTime = Math.max(now, lastTimestampRef.current + 1);
            lastTimestampRef.current = nextTime;
            const timestamp = new Date(nextTime).toISOString();
            
            // Optimistic UI: Show Plaintext locally!
            const tempMsg = {
                id: tempId, // Primary key fallback
                tempId: tempId, // Explicit index for lookups
                room_id: room.id,
                user_id: user.id,
                content,
                type: 'text',
                replyTo: finalReplyTo || null,
                created_at: timestamp,
                username: user.username,
                display_name: user ? user.display_name : 'Me',
                status: isOffline ? 'pending' : 'sending',
                is_encrypted: false, // Local is plaintext
                isDecrypted: true // Flag for UI to ignore decryption logic
            };

            // [FIX] Update Sidebar FIRST (synchronously, before any async ops)
            if (onMessageSent) {
                onMessageSent(room.id, tempMsg); 
            }

            // 1. SAVE TO DEXIE (Trigger Instant Render via useLiveQuery)
            await saveLocalMessage(tempMsg);
            
            setReplyTo(null);
            
            if (isOffline) {
                console.log('[Offline] Message queued in Dexie:', tempId);
            } else {
                try {
                    // --- E2EE START ---
                    
                    // 1. Get or Setup Room Key (Memory > DB > Server > Generate)
                    let roomKeyData = await cryptoManager.getRoomKey(room.id);
                    
                    // [OPTIMIZED] Cache Device List (1 min TTL)
                    const now_ts = Date.now();
                    const cachedDevices = roomDevicesCache.current.get(room.id);
                    let devices;
                    if (cachedDevices && now_ts - cachedDevices.timestamp < 60000) {
                        devices = cachedDevices.devices;
                    } else {
                        const devRes = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/devices`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (!devRes.ok) throw new Error('Failed to fetch devices');
                        devices = await devRes.json();
                        roomDevicesCache.current.set(room.id, { devices, timestamp: now_ts });
                    }
                    
                    const myDeviceId = await cryptoManager.init().then(i => i?.deviceId || cryptoManager.deviceId);

                    if (!roomKeyData) {
                        // [OPTIMIZED] Cache My Key Check
                        const cachedMyKey = roomMyKeyCache.current.get(room.id);
                        if (cachedMyKey && now_ts - cachedMyKey.timestamp < 30000) {
                             if (cachedMyKey.keyData) roomKeyData = cachedMyKey.keyData;
                        } else {
                            try {
                                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/keys/my?deviceId=${myDeviceId}`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                });
                                if (res.ok) {
                                    const keyData = await res.json();
                                    if (keyData && keyData.encrypted_key) {
                                        const decryptedKey = await cryptoManager.decryptRoomKey(keyData.encrypted_key);
                                        await cryptoManager.saveRoomKey(room.id, decryptedKey, keyData.key_version);
                                        roomKeyData = { key: decryptedKey, version: keyData.key_version };
                                        console.log('[E2EE] Retrieved existing key v', keyData.key_version);
                                        roomMyKeyCache.current.set(room.id, { keyData: roomKeyData, timestamp: now_ts });
                                    } else {
                                        roomMyKeyCache.current.set(room.id, { keyData: null, timestamp: now_ts });
                                    }
                                }
                            } catch (e) { console.warn('[E2EE] Server key check failed', e); }
                        }
                    }

                    if (!roomKeyData) {
                        // [OPTIMIZED] Cache Key Exists Check
                        let keyExists = false;
                        let latestVer = 0;
                        const cachedExists = roomKeyExistsCache.current.get(room.id);
                        if (cachedExists && now_ts - cachedExists.timestamp < 30000) {
                            keyExists = cachedExists.exists;
                            latestVer = cachedExists.latestVersion;
                        } else {
                            try {
                                const check = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/keys/exists`, { headers: { Authorization: `Bearer ${token}` } });
                                if (check.ok) {
                                    const checkData = await check.json();
                                    keyExists = checkData.exists;
                                    latestVer = checkData.latestVersion;
                                    roomKeyExistsCache.current.set(room.id, { exists: keyExists, latestVersion: latestVer, timestamp: now_ts });
                                    if (keyExists) console.warn(`[E2EE] Key v${latestVer} exists but I don't have it.`);
                                }
                            } catch(e) {}
                        }
                        
                        if (!roomKeyData) {
                             // C. Generate New Key (Rotation)
                             console.log('[E2EE] Generating New Room Key...');
                             const setup = await cryptoManager.generateAndEncryptRoomKey(room.id, devices);
                             roomKeyData = { key: setup.roomKey, version: setup.version };
                             
                             // Update Cache
                             roomMyKeyCache.current.set(room.id, { keyData: roomKeyData, timestamp: now_ts });
                             
                             // Upload Initial Batch to Server
                             fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/keys`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ keys: setup.encryptedKeys, keyVersion: setup.version, senderDeviceId: myDeviceId })
                             }).catch(e => console.error('[E2EE] Background key upload failed', e));
                        }
                    }

                    // 2. Generate Piggyback Headers
                    const distHeaders = await cryptoManager.getDistributionHeaders(
                        room.id, 
                        roomKeyData.key, 
                        roomKeyData.version, 
                        devices
                    );
                    
                    // 3. Encrypt Content
                    const { ciphertext, iv } = await cryptoManager.encryptMessage(content, roomKeyData.key, tempId);

                    // 4. Sign Message
                    const signature = await cryptoManager.signMessage(ciphertext, iv, tempId, roomKeyData.version);

                    // 5. Send
                    const payload = { 
                        roomId: room.id, 
                        content: '', 
                        ciphertext,
                        iv,
                        keyVersion: roomKeyData.version,
                        replyToMessageId: finalReplyTo ? finalReplyTo.id : null,
                        tempId,
                        signature,
                        signatureVersion: 1, 
                        senderDeviceId: myDeviceId,
                        distribution_headers: distHeaders, 
                        mention_user_ids,
                        meta: { type: 'text' }
                    };

                    // 2. Try to Send with ACK
                    if (socket.connected) {
                         socket.emit('send_message', payload, async (response) => {
                             if (response && response.status === 'ok') {
                                 // UPDATE SUCCESS IN DEXIE
                                 await updateLocalMessage(tempId, {
                                     id: String(response.messageId || tempId),
                                     status: 'sent'
                                 });

                                 // [NEW] Update Sidebar Tick
                                 if (onMessageStatusUpdate) {
                                     onMessageStatusUpdate(room.id, tempId, 'sent', response.messageId);
                                 }
                             } else {
                                 // Error: Mark as failed in Dexie
                                 await updateLocalMessage(tempId, { status: 'failed' });
                             }
                         });
                    } else {
                        // Mark as pending/offline in Dexie if socket disconnected mid-flight
                        await updateLocalMessage(tempId, { status: 'pending' });
                    }

                } catch (e) {
                    console.error('[E2EE] Encryption failed:', e);
                    await updateLocalMessage(tempId, { status: 'failed' });
                }
            }
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
                    updateLocalMessage(tempId, { uploadProgress: percent }).catch(console.error);
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

        // [FIX] Strictly Monotonic Timestamp
        const now = Date.now();
        const nextTime = Math.max(now, lastTimestampRef.current + 1);
        lastTimestampRef.current = nextTime;
        const tempId = `temp-${nextTime}`;
        const timestamp = new Date(nextTime).toISOString();
        const tempMsg = {
            id: tempId,
            tempId: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'audio',
            content: null,
            audio_url: URL.createObjectURL(blob),
            audio_duration_ms: durationMs,
            audio_waveform: waveform,
            replyTo: finalReplyTo || null,
            created_at: timestamp,
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            uploadStatus: 'uploading',
            uploadProgress: 0,
            localBlob: blob,
            isDecrypted: true
        };

        // [FIX] Update Sidebar FIRST (synchronously, before any async ops)
        if (onMessageSent) {
            onMessageSent(room.id, tempMsg);
        }

        // 1. SAVE TO DEXIE
        await saveLocalMessage(tempMsg);
        
        setReplyTo(null);

        const formData = new FormData();
        formData.append('audio', blob);
        formData.append('roomId', room.id);
        formData.append('durationMs', durationMs);
        formData.append('waveform', JSON.stringify(waveform));
        if (finalReplyTo) formData.append('replyToMessageId', finalReplyTo.id);
        formData.append('tempId', tempId);

        try {
            const result = await uploadAudioWithProgress(formData, tempId);
            // [FIX] Immediately reconcile optimistic message with server response
            // [FIX] Exclude created_at to preserve original timestamp for message ordering
            const { created_at, ...resultWithoutTimestamp } = result;
            await updateLocalMessage(tempId, {
                ...resultWithoutTimestamp,
                id: String(result.id),
                status: result.status || 'sent',
                uploadStatus: null, // Clear uploading state
                audio_url: tempMsg.audio_url?.startsWith('blob:') ? tempMsg.audio_url : result.audio_url
            });
        } catch (err) {
            console.error(err);
            await updateLocalMessage(tempId, { uploadStatus: 'failed', status: 'error' });
        }
    };

    const handleRetry = async (msg) => {
        const msgId = msg.tempId || msg.id;
        // [FIX] Preserve original created_at to maintain message position
        const originalCreatedAt = msg.created_at;
        
        // Handle text/GIF message retry (re-send via socket)
        if (msg.type === 'text' || msg.type === 'gif' || (!msg.type && msg.content)) {
            await updateLocalMessage(msgId, { status: 'sending' });
            
            try {
                // Re-encrypt and send
                let roomKeyData = await cryptoManager.getRoomKey(room.id);
                const myDeviceId = await cryptoManager.init().then(i => i?.deviceId || cryptoManager.deviceId);
                
                // Get devices for distribution headers
                const devRes = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/devices`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const devices = devRes.ok ? await devRes.json() : [];
                
                if (roomKeyData) {
                    const { ciphertext, iv } = await cryptoManager.encryptMessage(msg.content, roomKeyData.key, msgId);
                    const signature = await cryptoManager.signMessage(ciphertext, iv, msgId, roomKeyData.version);
                    const distHeaders = await cryptoManager.getDistributionHeaders(room.id, roomKeyData.key, roomKeyData.version, devices);
                    
                    const payload = {
                        roomId: room.id,
                        content: '',
                        ciphertext,
                        iv,
                        keyVersion: roomKeyData.version,
                        replyToMessageId: msg.replyTo ? msg.replyTo.id : null,
                        tempId: msgId,
                        signature,
                        signatureVersion: 1,
                        senderDeviceId: myDeviceId,
                        distribution_headers: distHeaders,
                        meta: msg.type === 'gif' ? { type: 'gif', gif_url: msg.gif_url } : { type: 'text' },
                        created_at: originalCreatedAt // [FIX] Preserve original position
                    };
                    
                    if (socket.connected) {
                        socket.emit('send_message', payload, async (response) => {
                            if (response && response.status === 'ok') {
                                await updateLocalMessage(msgId, { id: String(response.messageId || msgId), status: 'sent' });
                            } else {
                                await updateLocalMessage(msgId, { status: 'failed' });
                            }
                        });
                    } else {
                        await updateLocalMessage(msgId, { status: 'pending' });
                    }
                } else {
                    // No encryption key, send plaintext fallback
                    const payload = {
                        roomId: room.id,
                        content: msg.content,
                        replyToMessageId: msg.replyTo ? msg.replyTo.id : null,
                        tempId: msgId,
                        meta: msg.type === 'gif' ? { type: 'gif', gif_url: msg.gif_url } : { type: 'text' },
                        created_at: originalCreatedAt // [FIX] Preserve original position
                    };
                    
                    if (socket.connected) {
                        socket.emit('send_message', payload, async (response) => {
                            if (response && response.status === 'ok') {
                                await updateLocalMessage(msgId, { id: String(response.messageId || msgId), status: 'sent' });
                            } else {
                                await updateLocalMessage(msgId, { status: 'failed' });
                            }
                        });
                    } else {
                        await updateLocalMessage(msgId, { status: 'pending' });
                    }
                }
            } catch (err) {
                console.error('[Retry] Text message retry failed:', err);
                await updateLocalMessage(msgId, { status: 'failed' });
            }
            return;
        }
        
        // For media uploads, require localBlob
        if (!msg.localBlob && !msg.localBlobs) {
            console.warn('[Retry] No local blob found for media message');
            return;
        }
        
        await updateLocalMessage(msgId, { 
            uploadStatus: 'uploading', 
            uploadProgress: 0, 
            status: 'sending' 
        });

        const formData = new FormData();
        formData.append('roomId', room.id);
        if (msg.replyTo) formData.append('replyToMessageId', msg.replyTo.id);
        formData.append('tempId', msgId);
        // [FIX] Pass original created_at to preserve message position on retry
        if (originalCreatedAt) {
            formData.append('created_at', originalCreatedAt);
        }

        if (msg.type === 'audio') {
            formData.append('audio', msg.localBlob);
            formData.append('durationMs', msg.audio_duration_ms);
            formData.append('waveform', JSON.stringify(msg.audio_waveform));
            
            try {
                const result = await uploadAudioWithProgress(formData, msgId);
                // [FIX] Update local message with server response
                await updateLocalMessage(msgId, {
                    id: String(result.id),
                    audio_url: result.audio_url,
                    status: result.status || 'sent',
                    uploadStatus: null
                });
                // [FIX] Update sidebar status
                if (onMessageStatusUpdate) {
                    onMessageStatusUpdate(room.id, msgId, 'sent', result.id);
                }
            } catch (err) {
                console.error(err);
                await updateLocalMessage(msgId, { 
                    uploadStatus: 'failed', 
                    status: 'error' 
                });
            }
        } else if (msg.type === 'image') {
            if (msg.localBlobs && msg.localBlobs.length > 0) {
                 msg.localBlobs.forEach(b => formData.append('images', b));
            } else {
                 formData.append('images', msg.localBlob);
            }
            
            formData.append('caption', msg.caption || '');
            formData.append('isViewOnce', msg.is_view_once || false);
            
            // Add width/height metadata
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(att => {
                    formData.append('widths', att.width || 0);
                    formData.append('heights', att.height || 0);
                });
            }

            try {
                const result = await uploadImageWithProgress(formData, msgId);
                // [FIX] Update local message with server response (preserve local blob URLs)
                await updateLocalMessage(msgId, {
                    id: String(result.id),
                    image_url: msg.image_url?.startsWith('blob:') ? msg.image_url : result.image_url,
                    attachments: result.attachments,
                    status: result.status || 'sent',
                    uploadStatus: null,
                    viewed_by: result.viewed_by
                });
                // [FIX] Update sidebar status
                if (onMessageStatusUpdate) {
                    onMessageStatusUpdate(room.id, msgId, 'sent', result.id);
                }
            } catch (err) {
                 console.error(err);
                 await updateLocalMessage(msgId, { status: 'error', uploadStatus: 'failed' });
            }
        } else if (msg.type === 'file') {
            // File upload retry
            formData.append('file', msg.localBlob);
            formData.append('caption', msg.caption || '');
            
            try {
                const result = await uploadFileWithProgress(formData, msgId);
                // [FIX] Preserve original created_at to maintain message order - don't overwrite local timestamp
                await updateLocalMessage(msgId, {
                    id: String(result.id),
                    file_url: result.file_url,
                    file_name: result.file_name,
                    file_size: result.file_size,
                    file_type: result.file_type,
                    file_extension: result.file_extension,
                    status: result.status || 'sent',
                    uploadStatus: null
                });
                // [FIX] Update sidebar status
                if (onMessageStatusUpdate) {
                    onMessageStatusUpdate(room.id, msgId, 'sent', result.id);
                }
            } catch (err) {
                console.error(err);
                await updateLocalMessage(msgId, { status: 'error', uploadStatus: 'failed' });
            }
        }
    };

    const handleEditMessage = async (msgId, newContent, mention_user_ids) => {
        // [FIX] E2EE for Edit
        // 1. Find message to get tempId for salt derivation (must match decryption logic)
        const msg = messages.find(m => m.id === msgId);
        let saltId = msgId;
        if (msg) {
             if (msg.tempId) saltId = msg.tempId;
             else if (msg.temp_id) saltId = msg.temp_id;
        }

        let encryptedData = {};
        let keyVersionUsed = null;
        let signature = null; // [NEW] Signature

        try {
             // Get Latest Room Key to ensure all members (even new ones) can read it
             const roomKeyData = await cryptoManager.getRoomKey(String(room.id));
             if (roomKeyData) {
                 const { ciphertext, iv } = await cryptoManager.encryptMessage(newContent, roomKeyData.key, saltId);
                 
                 // [FIX] Sign the new content
                 try {
                    signature = await cryptoManager.signMessage(ciphertext, iv, saltId, roomKeyData.version);
                 } catch (sigErr) {
                     console.warn('Signing failed for edit', sigErr);
                 }

                 encryptedData = { ciphertext, iv };
                 keyVersionUsed = roomKeyData.version;
             }
        } catch (e) {
             console.error("Encryption failed for edit", e);
        }

        await updateLocalMessage(msgId, { 
            content: newContent, 
            caption: msg?.type === 'image' ? newContent : msg?.caption, 
            edited_at: new Date().toISOString(), 
            edit_version: (msg?.edit_version || 0) + 1 
        });
        setEditingMessage(null);

        try {
            const body = { 
                new_content: newContent, // Always send plaintext for backward compat / notifications if applicable
                ...encryptedData,        // ciphertext, iv
                key_version: keyVersionUsed,
                signature, // [NEW] Send signature
                mention_user_ids // [NEW] Track mentions in edits
            };

            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${msgId}/edit`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                console.error("Edit failed");
            }
        } catch (err) {
            console.error(err);
        }
    };

    // [NEW] Star/Unstar Handlers
    const handleStar = async (messageId) => {
        // Optimistic Update Persistence (Dexie)
        await updateLocalMessage(messageId, { is_starred: true });

        // API Call
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${messageId}/star`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err) {
            console.error("Failed to star message", err);
            // Revert on error? Or just retry silently next time?
            // For now, let's keep the optimistic state as offline-first approach usually prefers user intent.
        }
    };

    const handleUnstar = async (messageId) => {
        // Optimistic Update Persistence (Dexie)
        await updateLocalMessage(messageId, { is_starred: false });

        // API Call
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${messageId}/star`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err) {
            console.error("Failed to unstar message", err);
        }
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
        // [FIX] SEND INDIVIDUALLY IN PARALLEL (No await in loop)
        processedItems.forEach(item => {
            sendSingleImage(item.file, item.plainCaption, item.width, item.height, isViewOnce);
        });
    } else {
        // [FIX] SEND AS GROUP (No await needed here either as handleSendImages is usually fire-and-forget)
        // Find the single caption if it exists
        const groupCaption = processedItems.find(i => i.plainCaption.length > 0)?.plainCaption || "";
        sendImageGroup(processedItems, groupCaption, isViewOnce);
    }
    };

    // Helper for Single Image Send (Splitted)
    const sendSingleImage = async (file, caption, width, height, isViewOnce) => {
        // [FIX] Strictly Monotonic Timestamp
        const now = Date.now();
        const nextTime = Math.max(now, lastTimestampRef.current + 1);
        lastTimestampRef.current = nextTime;
        const tempId = `temp-${nextTime}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date(nextTime).toISOString();
        
        // Optimistic
        const tempMsg = {
            id: tempId,
            tempId: tempId,
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
            created_at: timestamp,
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            uploadStatus: 'uploading',
            uploadProgress: 0,
            localBlobs: [file],
            is_view_once: isViewOnce,
            viewed_by: [],
            isDecrypted: true
        };
        
        // [FIX] Update Sidebar FIRST (synchronously, before any async ops)
        if (onMessageSent) {
            onMessageSent(room.id, tempMsg);
        }
        
        // 1. SAVE TO DEXIE
        await saveLocalMessage(tempMsg);

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
            const result = await uploadImageWithProgress(formData, tempId);
            // [FIX] Immediately reconcile optimistic message with server response
            // [FIX] Exclude created_at to preserve original timestamp for message ordering
            const { created_at, ...resultWithoutTimestamp } = result;
            await updateLocalMessage(tempId, {
                ...resultWithoutTimestamp,
                id: String(result.id),
                status: result.status || 'sent',
                image_url: tempMsg.image_url?.startsWith('blob:') ? tempMsg.image_url : result.image_url,
                // [FIX] Preserve viewed_by if already set
                viewed_by: result.viewed_by
            });
        } catch (err) {
            console.error(err);
            await updateLocalMessage(tempId, { status: 'error' });
        }
    };

    // Helper for Group Send
    const sendImageGroup = async (items, groupCaption, isViewOnce) => {
        // [FIX] Strictly Monotonic Timestamp
        const now = Date.now();
        const nextTime = Math.max(now, lastTimestampRef.current + 1);
        lastTimestampRef.current = nextTime;
        const tempId = `temp-${nextTime}`;
        const timestamp = new Date(nextTime).toISOString();
        
        const attachments = items.map(item => ({
            url: URL.createObjectURL(item.file),
            width: item.width,
            height: item.height,
            size: item.file.size,
            type: 'image'
        }));

        const tempMsg = {
            id: tempId,
            tempId: tempId,
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
            created_at: timestamp,
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            uploadStatus: 'uploading',
            uploadProgress: 0,
            localBlobs: items.map(i => i.file),
            is_view_once: isViewOnce,
            viewed_by: [],
            isDecrypted: true
        };
        
        // [FIX] Update Sidebar FIRST (synchronously, before any async ops)
        if (onMessageSent) {
            onMessageSent(room.id, tempMsg);
        }
        
        // 1. SAVE TO DEXIE
        await saveLocalMessage(tempMsg);

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
            const result = await uploadImageWithProgress(formData, tempId);
            // [FIX] Immediately reconcile optimistic message with server response
            // [FIX] Exclude created_at to preserve original timestamp for message ordering
            const { created_at, ...resultWithoutTimestamp } = result;
            await updateLocalMessage(tempId, {
                ...resultWithoutTimestamp,
                id: String(result.id),
                status: result.status || 'sent',
                // [FIX] Preserve viewed_by if already set
                viewed_by: result.viewed_by
            });
        } catch (err) {
            console.error(err);
            await updateLocalMessage(tempId, { status: 'error' });
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
                    updateLocalMessage(tempId, { uploadProgress: percent }).catch(console.error);
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
                    updateLocalMessage(tempId, { uploadProgress: percent }).catch(console.error);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    // [FIX] Parse and log detailed error from server
                    let errorMsg = 'Upload failed';
                    try {
                        const errData = JSON.parse(xhr.responseText);
                        errorMsg = errData.details || errData.error || 'Upload failed';
                    } catch (e) {}
                    console.error('File upload error:', xhr.status, errorMsg);
                    reject(new Error(errorMsg));
                }
            };

            xhr.onerror = () => reject(new Error('Network error'));
            
            xhr.send(formData);
        });
    };

    const handleSendFile = async (file, caption) => {
        // [FIX] Strictly Monotonic Timestamp
        const now = Date.now();
        const nextTime = Math.max(now, lastTimestampRef.current + 1);
        lastTimestampRef.current = nextTime;
        const tempId = `temp-${nextTime}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date(nextTime).toISOString();
        const tempMsg = {
            id: tempId,
            tempId: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'file',
            content: 'File',
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            file_extension: file.name.split('.').pop(),
            caption: caption || '',
            replyTo: replyTo || null,
            created_at: timestamp,
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            uploadStatus: 'uploading',
            uploadProgress: 0,
            localBlob: file,
            isDecrypted: true
        };
        
        // [FIX] Update Sidebar FIRST (synchronously, before any async ops)
        if (onMessageSent) {
            onMessageSent(room.id, tempMsg);
        }
        
        // 1. SAVE TO DEXIE
        await saveLocalMessage(tempMsg);
        
        setReplyTo(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomId', room.id);
        formData.append('tempId', tempId);
        formData.append('caption', caption || '');
        if (replyTo) formData.append('replyToMessageId', replyTo.id);

        try {
            const result = await uploadFileWithProgress(formData, tempId);
            // [FIX] Immediately reconcile optimistic message with server response
            // [FIX] Exclude created_at to preserve original timestamp for message ordering
            const { created_at, ...resultWithoutTimestamp } = result;
            await updateLocalMessage(tempId, {
                ...resultWithoutTimestamp,
                id: String(result.id),
                status: result.status || 'sent',
                uploadStatus: null // Clear uploading state
            });
        } catch (err) {
            console.error(err);
            await updateLocalMessage(tempId, { status: 'error', uploadStatus: 'failed' });
        }
    };

    const handleSendGif = async (gif, caption, mention_user_ids) => {
        // [FIX] Strictly Monotonic Timestamp
        const now = Date.now();
        const nextTime = Math.max(now, lastTimestampRef.current + 1);
        lastTimestampRef.current = nextTime;
        const tempId = `temp-${nextTime}`;
        const timestamp = new Date(nextTime).toISOString();
        const finalGifUrl = gif.mp4_url || gif.gif_url;
        const finalPreviewUrl = gif.preview_url || gif.gifpreview;
        
        const tempMsg = {
            id: tempId,
            tempId: tempId,
            room_id: room.id,
            user_id: user.id,
            type: 'gif',
            content: caption || null,
            gif_url: finalGifUrl,
            preview_url: finalPreviewUrl,
            width: gif.width,
            height: gif.height,
            replyTo: replyTo || null,
            created_at: timestamp,
            username: user.username,
            display_name: user ? user.display_name : 'Me',
            status: 'sending',
            isDecrypted: true
        };

        // [FIX] Update Sidebar FIRST (synchronously, before any async ops)
        if (onMessageSent) {
            onMessageSent(room.id, tempMsg);
        }

        // 1. SAVE TO DEXIE
        await saveLocalMessage(tempMsg);
        
        const replyToId = replyTo ? replyTo.id : null;
        setReplyTo(null);

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
                    replyToMessageId: replyToId,
                    tempId,
                    mention_user_ids
                })
            });
        } catch (err) {
            console.error(err);
            await updateLocalMessage(tempId, { status: 'error' });
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

    const handleRetryDecryption = async (msgId) => {
        await updateLocalMessage(msgId, { isDecryptionRetrying: true });

        try {
            const msg = messages.find(m => String(m.id) === String(msgId));
            if (!msg) return;

            const decrypted = await decryptPayload(msg);
            
            await updateLocalMessage(msgId, { 
                ...decrypted, 
                isDecryptionRetrying: false,
                isDecrypted: true
            });

        } catch (e) {
            console.error("Retry failed", e);
            await updateLocalMessage(msgId, { isDecryptionRetrying: false });
        }
    };

    return (
        <div className={`flex flex-col h-[100dvh] bg-gray-50 dark:bg-slate-950 relative overflow-hidden chat-container ${isChatReady ? 'transition-colors' : ''}`}> {/* Added class for reference */}
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
            <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-200/40 via-gray-50 to-gray-50 dark:from-violet-900/20 dark:via-slate-950 dark:to-slate-950 pointer-events-none ${isChatReady ? 'transition-colors' : ''}`} />
            
            {/* Doodle Background Pattern */}
            <div 
                className="absolute inset-0 pointer-events-none z-0 invert dark:invert-0 opacity-[0.08]"
                style={{
                    backgroundImage: 'url(/chat-doodle.png)',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '412.5px 749.25px'
                }}
                aria-hidden="true"
            />

            {/* Header */}
            <div className="sticky top-0 z-50 border-b border-slate-200/50 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex flex-col shadow-sm transition-colors">
                {/* Main Header Row */}
                <div className="py-2.5 px-4 flex items-center gap-4">
                    <button 
                        onClick={onBack}
                        className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>

                    <div 
                        ref={headerRef}
                        className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer"
                        onClick={() => {
                            if (room.type === 'direct') onOpenProfile(room.other_user_id, room.id, hasSkippedSync);
                            else setShowGroupInfo(true);
                        }}
                    >
                        {/* Header Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shrink-0 overflow-hidden ${!room.avatar_url && !room.avatar_thumb_url ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}>
                            {(room.avatar_url || room.avatar_thumb_url) ? (
                                <img src={room.avatar_url || room.avatar_thumb_url} alt={room.name} className="w-full h-full object-cover" />
                            ) : (
                                room.type === 'direct' 
                                    ? room.display_name?.[0]?.toUpperCase() || room.name?.[0]?.toUpperCase()
                                    : '#'
                            )}
                        </div>

                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 truncate transition-colors duration-300">
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
                            
                            {room.type === 'direct' && otherUserStatus && !isBlockedByMe && !isBlockedByThem && (
                                <div className="text-[11px] font-medium leading-tight">
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
                        {room.type === 'direct' && (
                            <>
                                <button 
                                    onClick={() => {
                                        const isUnknown = room.type === 'direct' && !room.username && !room.display_name;
                                        if (!isUnknown) {
                                            initiateCall(room.other_user_id || otherUserId, room.id, 'audio', room.name, room.avatar_url || room.avatar_thumb_url);
                                        }
                                    }}
                                    className={`p-2 transition-all rounded-full ${(!room.username && !room.display_name) ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400'}`}
                                    title={(!room.username && !room.display_name) ? "Cannot call deleted account" : (isBlockedByMe || isBlockedByThem) ? "Call unavailable" : "Voice Call"}
                                    disabled={(!room.username && !room.display_name) || isBlockedByMe || isBlockedByThem}
                                >
                                    <span className={`material-symbols-outlined ${isBlockedByMe || isBlockedByThem ? 'opacity-50' : ''}`}>call</span>
                                </button>
                                <button 
                                    onClick={() => {
                                        const isUnknown = room.type === 'direct' && !room.username && !room.display_name;
                                        if (!isUnknown && !isBlockedByMe && !isBlockedByThem) {
                                            initiateCall(room.other_user_id || otherUserId, room.id, 'video', room.name, room.avatar_url || room.avatar_thumb_url);
                                        }
                                    }}
                                    className={`p-2 transition-all rounded-full ${(!room.username && !room.display_name) || isBlockedByMe || isBlockedByThem ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400'}`}
                                    title={(!room.username && !room.display_name) ? "Cannot call deleted account" : (isBlockedByMe || isBlockedByThem) ? "Call unavailable" : "Video Call"}
                                    disabled={(!room.username && !room.display_name) || isBlockedByMe || isBlockedByThem}
                                >
                                    <span className={`material-symbols-outlined ${isBlockedByMe || isBlockedByThem ? 'opacity-50' : ''}`}>videocam</span>
                                </button>
                            </>
                        )}
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
                onUnpin={async (msgId) => {
                    await updateLocalMessage(msgId, { is_pinned: false });
                }}
                socket={socket}
                decryptMessage={decryptPayload} // [NEW] Pass decryption function
            />

            {/* [OPTIMIZATION] Only show skeleton if we truly have no data (neither fresh nor cached) AND we're loading */}
            {(isLoading && (!messages || messages.length === 0) && (!room.initialMessages || room.initialMessages.length === 0)) ? (
                <ChatSkeleton />
            ) : (
                <MessageList 
                    key={room.id} /* Force clean remount on room change */
                    messages={messages || []}
                    currentUser={user} 
                    roomId={room.id} 
                    socket={socket} 
                    onReply={setReplyTo} 
                    onDelete={handleLocalDelete}
                    onRetry={handleRetry} 
                    onEdit={setEditingMessage}
                    onReact={handleReact}
                    onUnreact={handleUnreact}
                    onPin={(msg) => {
                        if (msg.is_pinned) {
                            // Unpin directly
                            fetch(
                                `${import.meta.env.VITE_API_URL}/api/messages/${msg.id}/pin`,
                                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
                            ).then(res => {
                                if (res.ok) {
                                    updateLocalMessage(msg.id, { is_pinned: false }).catch(console.error);
                                }
                            }).catch(console.error);
                        } else {
                            // Show duration modal for pinning
                            setPinToConfirm(msg);
                        }
                            }}
                    // Selection Props
                    isSelectionMode={isSelectionMode}
                    selectedMessageIds={selectedMessageIds}
                    onToggleMessageSelection={toggleMessageSelection}
                    onToggleSelectionMode={() => setIsSelectionMode(!isSelectionMode)}
                    lastReadMessageId={frozenDividerMessageId} // [NEW] Use frozen snapshot for stable divider
                    onBottomInView={() => {
                        setIsAtBottom(true);
                        markAsRead();
                    }}
                    searchTerm={searchTerm}
                    onLoadMore={handleLoadOlderMessages}
                    hasMore={hasMore}
                    loadingMore={loadingMore}
                    isAiChat={room.other_user_id === 'ai-assistant' || room.id === 'ai-chat' || room.type === 'ai'}
                    chatPreferences={chatPreferences} // [NEW]
                    onStar={handleStar}
                    onUnstar={handleUnstar}
                    // [NEW] Animation Prop
                    isRestoreAnimation={isRestoreAnimation}
                    hasSkippedSync={hasSkippedSync} // [NEW]
                    onOpenProfile={(uid, rid, sync) => {
                        // If internal nav
                        if (uid) {
                            onOpenProfile(uid, rid || room.id, sync);
                        } else {
                            // If user clicked Header or Main Profile
                            if (onOpenMainProfile) {
                                // We are passing a callback to handle side effects from the profile panel (like block/unblock)
                                // We need to check how onOpenMainProfile is implemented. 
                                // Actually, MessageList calls onOpenProfile when clicking avatar.
                                // If we are here, it means we are opening the profile panel. 
                                // The ProfilePanel is rendered by the PARENT (Dashboard presumably) or Sidebar?
                                // Wait, ChatWindow renders ProfilePanel if ShowGroupInfo is true? 
                                // No, ChatWindow has a ProfilePanel import but I don't see it rendered in the main flow EXCEPT maybe via ShowGroupInfo?
                                
                                // Let's check line 8. import ProfilePanel from './ProfilePanel';
                                // It seems I missed where ProfilePanel is rendered in ChatWindow.
                                // In the first view_file, it was imported.
                                // Let's look at where showGroupInfo is used.
                                // If it's a direct chat, onOpenMainProfile is called.
                                // If it's a group, setShowGroupInfo(true) is called.
                                
                                // Ah, usually ProfilePanel is for Direct chats too if implemented inside ChatWindow. 
                                // If onOpenMainProfile is passed, it means the Panel is outside.
                                // If the Panel is outside, we need to pass the callback `onActionSuccess` upwards?
                                // OR `ChatWindow` has `onRefresh` prop which might reload the whole room?
                                
                                // If `onOpenMainProfile` is used (likely for Mobile or Sidebar integration), the parent needs to handle the update.
                                // BUT, if we are in `ChatWindow`, `isBlockedByMe` is a local state derived from props but updated via fetch in useEffect.
                                // If the parent re-renders `ChatWindow` with new `room` prop, it updates.
                                // But we want INSTANT update.
                                
                                // If the ProfilePanel is OUTSIDE ChatWindow, we can't pass a callback directly from here unless onOpenMainProfile accepts it.
                                
                                // However, looking at the code I see `ProfilePanel` imported. I suspect it MIGHT be rendered conditionally.
                                // Let's search for `<ProfilePanel` in the code.
                                // A grep search earlier showed it in ChatWindow.jsx.
                                // I'll assume it's rendered somewhere I missed or the view_file didn't cover it?
                                // Wait, view_file covered lines 1-150 and 800-2831. 
                                // Maybe it's between 150 and 800? 
                                // Let me check lines 150-800 quickly if I can? 
                                // Actually, I'll just check if I can see it in the `return` statement.
                                // Lines 2270+ is the return. 
                                // I see `PrivilegedUsersModal`, `PinnedMessagesPanel`, `MessageList`, `LocationPicker`, etc.
                                // I DO NOT see `<ProfilePanel` in the return block I viewed (2270+).
                                
                                // So `ProfilePanel` is likely rendered by the PARENT (Dashboard) via `onOpenMainProfile` or similar.
                                // If so, when `ProfilePanel` performs an action, it should call `onActionSuccess`. 
                                // `ChatWindow` needs to know about this.
                                
                                // If `onOpenMainProfile` is a function passed from parent, we can't easily hook into the panel's success callback unless the parent exposes it.
                                
                                // However, `ChatWindow` has `isBlockedByMe` state.
                                // And `ChatWindow` listens to `you_are_blocked`(by them) socket event.
                                // But for "Blocking them", we do it via API.
                                
                                // IF ProfilePanel is outside, we need to rely on:
                                // 1. Parent refreshing the room prop.
                                // 2. A socket event that tells us we blocked someone? (Unlikely for self-action, usually response).
                                
                                // WAIT! `onOpenMainProfile` might be just a function to toggle UI.
                                // If `ChatWindow` is solely responsible for the view, and `ProfilePanel` is logically "part" of the chat view (e.g. right sidebar), usually it's inside `ChatWindow`.
                                
                                // Let's look at `Dashboard.jsx`? No, I should stick to `ChatWindow`.
                                // If `ProfilePanel` is imported but not used, that's weird.
                                // Let me check lines 150-800.
                                return onOpenMainProfile();
                            }
                            if (room.type === 'direct') {
                                onOpenProfile(room.other_user_id, room.id, hasSkippedSync);
                            } else {
                                setShowGroupInfo(true);
                            }
                        }
                    }}
                />
            )}

            {/* [NEW] Profile Panel (Right Sidebar) handled locally if group or if direct and we want it here? */}
            {/* Actually, if setShowGroupInfo(true) sets a state, where is that state used? */}
            {/* I see `showGroupInfo` prop. I see `setShowGroupInfo` prop. */}
            {/* If it's a prop, the parent handles the visibility. */}
            
            {(showGroupInfo || (room.type === 'direct' && showGroupInfo)) && (
                <ProfilePanel 
                    isOpen={true}
                    userId={room.type === 'direct' ? (room.other_user_id || otherUserId) : null}
                    roomId={room.id}
                    onClose={() => setShowGroupInfo(false)}
                    onActionSuccess={(action) => {
                        console.log('Profile Action:', action);
                        if (action === 'block') setIsBlockedByMe(true);
                        if (action === 'unblock') setIsBlockedByMe(false);
                        if (action === 'delete') {
                             if (onBack) onBack(); // Go back if chat deleted
                        }
                        if (action === 'clear') {
                            // Handled by socket or local clear
                            if (onRefresh) onRefresh();
                        }
                    }}
                />
            )}

            

            
            {/* Typing Indicator */}
            {typingByRoom[room.id] && typingByRoom[room.id].length > 0 && (
                <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 font-medium italic animate-pulse flex items-center gap-1 z-10 bg-white/50 dark:bg-slate-900/30 backdrop-blur-sm transition-colors duration-300">
                    {(() => {
                        const users = typingByRoom[room.id];
                        if (users.length === 1) return <>{renderTextWithEmojis(users[0].name)} is typing...</>;
                        if (users.length === 2) return <>{renderTextWithEmojis(users[0].name)} and {renderTextWithEmojis(users[1].name)} are typing...</>;
                        return <>{users.length} people are typing...</>;
                    })()}
                </div>
            )}

            {/* Message Input or Block Banner */}
            {canSend ? (

                <>
                    {isSelectionMode ? (
                        <SelectionBar 
                            count={selectedMessageIds.size}
                            onCancel={handleCancelSelection}
                            onDelete={handleDeleteSelected}
                            onCopy={handleCopySelectedMessages}
                            canCopy={canCopy && !Array.from(selectedMessageIds).some(id => messages.find(m => m.id === id)?.is_view_once)}
                        />
                    ) : (
                        <MessageInput 
                            onSend={handleSend}         
                            onSendAudio={handleSendAudio}
                            onImageSelected={handleImageSelected}
                            onFileSelected={handleFileSelected}
                            onSendGif={handleSendGif}
                            onLocationClick={() => setShowLocationPicker(true)}
                            onPollClick={() => setShowCreatePoll(true)}
                            onTodoClick={() => setShowCreateTodo(true)}
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
                            isBlocked={isBlockedByMe}
                            onUnblock={handleUnblock}
                        />
                    )}
                </>
            ) : (
                <div className="p-4 bg-transparent z-10 flex justify-center items-center h-[88px] transition-colors duration-300">
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



            {/* [NEW] Scoped Image Preview Modal */}
            {selectedImages && (
                <div className="absolute inset-0 z-[60] flex flex-col bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
                <div className="absolute inset-0 z-[60] flex flex-col bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
                    // [FIX] Strictly Monotonic Timestamp
                    const now = Date.now();
                    const nextTime = Math.max(now, lastTimestampRef.current + 1);
                    lastTimestampRef.current = nextTime;
                    const tempId = `temp-${nextTime}`;
                    const timestamp = new Date(nextTime).toISOString();
                    const tempMsg = {
                        id: tempId,
                        tempId: tempId,
                        room_id: room.id,
                        user_id: user.id,
                        type: 'location',
                        content: location.address || 'Location',
                        latitude: location.latitude,
                        longitude: location.longitude,
                        address: location.address,
                        created_at: timestamp,
                        username: user.username,
                        display_name: user.display_name,
                        status: 'sending',
                        isDecrypted: true
                    };
                    
                    // 1. SAVE TO DEXIE
                    await saveLocalMessage(tempMsg);

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
                        await updateLocalMessage(tempId, { status: 'error' });
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

            {/* [NEW] Create Todo Modal from Chat */}
            <CreateTodoModal
                isOpen={showCreateTodo}
                onClose={() => setShowCreateTodo(false)}
                rooms={[]} // Not needed when fixedRoomId is provided
                activeRoom={room}
                fixedRoomId={room.id}
            />

            {/* [NEW] Pin Duration Modal */}
            <PinDurationModal 
                isOpen={!!pinToConfirm}
                onClose={() => setPinToConfirm(null)}
                message={pinToConfirm}
                onPin={async (msg, durationHours) => {
                    // Optimistic update - show pinned immediately (Dexie Source of Truth)
                    await updateLocalMessage(msg.id, { is_pinned: true, pinned_by: user.id });
                    
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
                            await updateLocalMessage(msg.id, { is_pinned: false, pinned_by: null });
                        }
                    } catch (err) {
                        console.error('Failed to pin:', err);
                        // Revert on error
                        await updateLocalMessage(msg.id, { is_pinned: false, pinned_by: null });
                    }
                }}
            />

            {/* [NEW] Delete Selection Modal */}
            {deleteSelectionModal.isOpen && (
                <div className="absolute inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] max-w-sm w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
                                Delete {deleteSelectionModal.count} message{deleteSelectionModal.count !== 1 ? 's' : ''}?
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                                {deleteSelectionModal.canDeleteForEveryone 
                                    ? "You can delete these messages for everyone or just for yourself."
                                    : "You can only delete these messages for yourself."}
                            </p>
                            
                            <div className="flex flex-col gap-2">
                                {deleteSelectionModal.canDeleteForEveryone && (
                                    <button
                                        onClick={() => handleConfirmDeleteSelection(true)}
                                        className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-lg">delete_forever</span>
                                        Delete for everyone
                                    </button>
                                )}
                                
                                <button
                                    onClick={() => handleConfirmDeleteSelection(false)}
                                    className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 border border-violet-200 dark:border-slate-700 hover:bg-violet-50 dark:hover:bg-slate-700/50 text-violet-600 dark:text-violet-400 font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-lg">delete</span>
                                    Delete for me
                                </button>
                                
                                <button
                                    onClick={() => setDeleteSelectionModal({ ...deleteSelectionModal, isOpen: false })}
                                    className="w-full py-2.5 px-4 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors mt-2"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

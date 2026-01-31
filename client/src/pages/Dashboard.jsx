import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import db, {
    saveLocalMessage,
    updateLocalMessage,
    deleteLocalMessage,
    getPendingMessages,
    deletePendingMessage
} from '../utils/db'; 
import { processIncomingMessage, normalizeReplies, getMessagePreview } from '../utils/messageHydrator';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
// [MODIFIED] Use context, don't provide it here
import { useChatLock } from '../context/ChatLockContext';
import Sidebar from '../components/Sidebar';
import SideNav from '../components/SideNav';
import ChatWindow from '../components/ChatWindow';
import AIChatWindow from '../components/AIChatWindow';
import CreateRoomModal from '../components/CreateRoomModal';
import JoinRoomModal from '../components/JoinRoomModal';
import GroupInfoModal from '../components/GroupInfoModal';
import LogoutModal from '../components/LogoutModal';
import RestoreModal from '../components/RestoreModal';
import { countRoomKeys } from '../lib/crypto/db';
import NotificationPermissionBanner from '../components/NotificationPermissionBanner';
import ChatAreaLockGuard from '../components/ChatAreaLockGuard';
import ProfilePanel from '../components/ProfilePanel'; // [NEW]
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import io from 'socket.io-client';
import { PresenceProvider } from '../context/PresenceContext';

import { AiChatProvider } from '../context/AiChatContext';
import notificationSound from '../assets/notification.ogg';
import sentSound from '../assets/sent.ogg';
import { cryptoManager } from '../lib/crypto/CryptoManager';
import { CallProvider } from '../context/CallContext';
import CallModal from '../components/CallModal';

// Helper to strip emoji characters from text (for clean notification display)
const stripEmojis = (text) => {
    if (!text) return '';
    // Remove emoji characters (Unicode ranges for emojis)
    return text
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE0F}]/gu, '')
        .trim();
};





// Status priority for tick consistency
const STATUS_PRIORITY = {
    'seen': 4,
    'delivered': 3,
    'sent': 2,
    'sending': 1,
    'pending': 0,
    'error': -1
};

const getStatusPriority = (status) => STATUS_PRIORITY[status] || 0;
const isStatusBetter = (newStatus, oldStatus) => getStatusPriority(newStatus) > getStatusPriority(oldStatus);
const isStatusWorse = (newStatus, oldStatus) => getStatusPriority(newStatus) < getStatusPriority(oldStatus);

export default function Dashboard() {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, token, logout, updateUser } = useAuth();
    const { showNotification, canNotify } = useNotification();
    const [rooms, setRooms] = useState([]);
    const [activeFilter, setActiveFilter] = useState('direct'); // 'direct' | 'group' | 'ai'
    const [activeRoom, setActiveRoom] = useState(null);
    const [loadingRoomId, setLoadingRoomId] = useState(null); // [NEW] Loading state for chat switching
    const [isLoadingRooms, setIsLoadingRooms] = useState(true); // [NEW] Initial loading state
    const [socket, setSocket] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);

    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [highlightMessageId, setHighlightMessageId] = useState(null); 
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [profileState, setProfileState] = useState({ 
        isOpen: false, 
        userId: null, 
        roomId: null, 
        showRestoreOption: false 
    }); // [NEW] Centralized profile state

    const handleOpenProfile = useCallback((userId, roomId = null, showRestore = false) => {
        setProfileState({
            isOpen: true,
            userId: userId,
            roomId: roomId,
            showRestoreOption: showRestore
        });
    }, []);

    const handleCloseProfile = useCallback(() => {
        setProfileState(prev => ({ ...prev, isOpen: false }));
    }, []);

    const isProcessingInviteRef = useRef(false);

    const [syncState, setSyncState] = useState({ 
        active: false, 
        status: '', 
        showBackupPrompt: false,
        mode: 'approve' // 'approve' or 'password'
    });
    const [pendingSyncRequest, setPendingSyncRequest] = useState(null);
    const pendingSyncRequestRef = useRef(null); // [FIX] Ref to avoid stale closure in socket handlers
    
    // [FIX] Keep ref in sync with state
    useEffect(() => {
        pendingSyncRequestRef.current = pendingSyncRequest;
    }, [pendingSyncRequest]);

    const ecdhKeysRef = useRef(null);
    const syncTimeoutRef = useRef(null);

    // [PHASE 2] Manual Restore States
    const [restorePassword, setRestorePassword] = useState('');
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreError, setRestoreError] = useState('');
    
    // [NEW] Post-Restore Animation State
    const [justRestored, setJustRestored] = useState(false);

    // [NEW] Track if user skipped sync (to show manual restore option)
    const [hasSkippedSync, setHasSkippedSync] = useState(() => localStorage.getItem('skipped_sync') === 'true');
    const [showRestoreModal, setShowRestoreModal] = useState(false); // [NEW] For profile-triggered restore
    const [showPassword, setShowPassword] = useState(false); // [NEW] Password visibility toggle
    // [NEW] Track when history was hidden to allow new chats to skip the banner
    const [historyHiddenAt, setHistoryHiddenAt] = useState(() => {
        const saved = localStorage.getItem('history_hidden_at');
        return saved ? parseInt(saved, 10) : null;
    });
    const seenMessages = useRef(new Set()); // [NEW] Global Replay Protection
    const [typingByRoom, setTypingByRoom] = useState({}); // [NEW] { roomId: [{ userId, name }] }
    const globalTypingTimeoutsRef = useRef({}); // [NEW] { "roomId:userId": timeoutId }

    // [NEW] Unread counts for SideNav badges
    const unreadCounts = useMemo(() => ({
        group: rooms.filter(r => r.type === 'group' && !r.is_archived && r.unread_count > 0).length,
        direct: rooms.filter(r => r.type === 'direct' && !r.is_archived && r.unread_count > 0).length
    }), [rooms]);

    // [NEW] Helper to wait for all rooms to finish decrypting (real-time completion)
    const waitForAllDecryptions = useCallback((roomsList) => {
        return new Promise((resolve) => {
            // Get rooms that have encrypted content that needs decryption
            const encryptedRoomIds = new Set(
                roomsList
                    .filter(r => r.last_message_ciphertext && r.last_message_iv)
                    .map(r => String(r.id))
            );
            
            // If no encrypted rooms, resolve immediately
            if (encryptedRoomIds.size === 0) {
                resolve();
                return;
            }
            
            const decryptedRoomIds = new Set();
            const maxWaitTime = 15000; // 15 second max wait
            let timeoutId;
            
            const handleRoomDecrypted = (e) => {
                const roomId = String(e.detail?.roomId);
                if (encryptedRoomIds.has(roomId)) {
                    decryptedRoomIds.add(roomId);
                    
                    // Check if all encrypted rooms are now decrypted
                    if (decryptedRoomIds.size >= encryptedRoomIds.size) {
                        cleanup();
                        resolve();
                    }
                }
            };
            
            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('cipher:room-decrypted', handleRoomDecrypted);
            };
            
            // Safety timeout - don't wait forever
            timeoutId = setTimeout(() => {
                console.log('[Dashboard] Decryption wait timeout. Completed:', decryptedRoomIds.size, '/', encryptedRoomIds.size);
                cleanup();
                resolve();
            }, maxWaitTime);
            
            window.addEventListener('cipher:room-decrypted', handleRoomDecrypted);
        });
    }, []);

    const handleManualRestore = async (e) => {
        if (e) e.preventDefault();
        setIsRestoring(true);
        setRestoreError('');

        try {
            // 1. Fetch encrypted backup from server
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch backup');
            const data = await res.json();
            if (!data) throw new Error('No backup found on server');

            // 2. Decrypt bundle using password
            const bundle = await cryptoManager.decryptBackup(
                data.encrypted_blob,
                data.salt,
                data.iv,
                restorePassword
            );

            // 3. Import keys
            await cryptoManager.importKeysSync(bundle);

            // [NEW] Enable auto-backup so future room keys are automatically backed up
            await cryptoManager.enableAutoBackup(restorePassword, data.salt, token);

            // 4. Notify others to clear popups
            socket?.emit('sync_finished');

            // [FIX] Update status to show progress while keeping modal open
            setSyncState(prev => ({ ...prev, status: 'Importing keys...' }));
            
            // [NEW] Clear skipped flag on success
            localStorage.removeItem('skipped_sync');
            setHasSkippedSync(false);

            // Trigger animation on next chat open
            setJustRestored(true); 
            
            // [FIX] Dispatch keys-updated event so sidebar components know to re-decrypt
            window.dispatchEvent(new CustomEvent('cipher:keys-updated', { 
                detail: { type: 'bulk-import' } 
            }));
            
            // [FIX] Update status for sidebar decryption phase
            setSyncState(prev => ({ ...prev, status: 'Decrypting your messages...' }));
            
            // [FIX] Fetch rooms first to know which need decryption
            const freshRooms = await fetchRooms(true);
            
            // [FIX] Dispatch keys-updated event to trigger sidebar re-decryption
            window.dispatchEvent(new CustomEvent('cipher:keys-updated', { 
                detail: { type: 'bulk-import' } 
            }));
            
            // [NEW] Wait for ALL rooms to actually finish decrypting (real-time, not fixed timeout)
            await waitForAllDecryptions(freshRooms || rooms);
            
            // [FIX] Close modal AFTER everything is complete
            setSyncState({ active: false, status: 'Success!', showBackupPrompt: false, mode: 'approve' });

            showNotification('Chat history restored successfully!', 'success');
        } catch (err) {
            console.error('[Restore] Error:', err);
            setRestoreError(err.name === 'OperationError' ? 'Invalid password. Decryption failed.' : 'Restoration failed. Please try again.');
        } finally {
            setIsRestoring(false);
        }
    };

    // [NEW] Handle Cancel/Skip Sync
    const handleSkipSync = () => {
        // [FIX] Clear timeout to prevent mode switch
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

        // 1. Notify server to tell other devices to close popups
        if (syncState.active && socket) {
            console.log('[Sync] Cancelling sync request...');
            socket.emit('sync_canceled');
        }

        // 2. Close local modal
        setSyncState({ active: false, status: '', showBackupPrompt: false, mode: 'approve' });

        localStorage.setItem('skipped_sync', 'true');
        const now = Date.now();
        localStorage.setItem('history_hidden_at', now.toString()); // [NEW] Mark when history was hidden
        setHasSkippedSync(true);
        setHistoryHiddenAt(now);
        
        // 3. Ensure we have fallback identity (CryptoManager handles init automatically on load, so we are good)
        // Just show a small toast for clarity
        showNotification('History sync skipped. You can always restore later from settings.', 'info');
    };

    const handleDenySyncRequest = () => {
        if (!socket || !pendingSyncRequest) return;
        socket.emit('sync_denied', { targetDeviceId: pendingSyncRequest.targetDeviceId });
        setPendingSyncRequest(null);
    };

    const handleApproveSync = async () => {
        if (!socket || !pendingSyncRequest) return;
        const { targetDeviceId, senderPublicKey } = pendingSyncRequest;
        
        try {
            // 1. Generate our own ECDH key to respond
            const myKeyPair = await cryptoManager.generateECDHKeyPair();
            
            // 2. Derive Shared Secret
            const sharedKey = await cryptoManager.deriveSharedSyncKey(myKeyPair.privateKey, senderPublicKey);
            
            // 3. Export all keys as JWK
            const bundle = await cryptoManager.exportAllKeysSync();
            
            // 4. Encrypt bundle
            const encrypted = await cryptoManager.encryptSyncBundle(bundle, sharedKey);
            
            // 5. Provide Public Key for their side to derive same secret
            const myPubBuffer = await window.crypto.subtle.exportKey('spki', myKeyPair.publicKey);
            const myPubBase64 = cryptoManager.arrayBufferToBase64(myPubBuffer);

            socket.emit('provide_key_sync', {
                targetDeviceId,
                encryptedBlob: encrypted,
                senderPublicKey: myPubBase64
            });
            
            // [FIX] Keep modal open in "Syncing..." state
            // It will only close when the receiving device confirms completion OR when user manually closes.
            // Or if this is the APPROVING device, we might close it now because our job is done?
            // Wait, user said "new device detect modal stay untill fully decript messages in new device"
            // This usually refers to the NEW device.
            // BUT if this is the OLD device approving the sync, the user might want visual confirmation 
            // that the keys were actually RECEIVED by the new device.
            // Let's keep it open with a success message or "Sending keys..." status until `sync_finished`.
            
            setPendingSyncRequest(prev => ({ 
                ...prev, 
                status: 'approving',
                approvingState: 'sent' // New internal state to show "Keys Sent, Waiting for confirmation..."
            }));

        } catch (e) {
            console.error('[Sync] Failed to provide keys', e);
            setPendingSyncRequest(null);
            alert('Failed to send keys');
        }
    };

    // [NEW] Effect to handle sync completion event (for the Approving Device)
    useEffect(() => {
        if (!socket) return;
        
        const onSyncFinished = () => {
            console.log('[Dashboard] Sync confirmed by new device.');
            // Only close if we are currently showing the approval modal in a "sent" state
            setPendingSyncRequest(prev => {
                if (prev && prev.status === 'approving') {
                    return null; // Close modal
                }
                return prev;
            });
            // Optional: Show toast
            // showNotification('Device synced successfully', 'success');
        };

        socket.on('sync_finished', onSyncFinished);
        return () => socket.off('sync_finished', onSyncFinished);
    }, [socket]);

    const triggerSync = useCallback(async () => {
        if (!socket) {
            console.warn('[Sync] Cannot trigger sync: Socket not initialized');
            return;
        }
        
        console.log(`[Sync] Starting Key Sync Race... DeviceID: ${cryptoManager.deviceId}`);
        console.log(`[Sync] Starting Key Sync Race... DeviceID: ${cryptoManager.deviceId}`);
        setSyncState({ active: true, status: 'Contacting other devices...', showBackupPrompt: false, mode: 'approve' });

        // 1. Generate Ephemeral ECDH Keys
        const keyPair = await cryptoManager.generateECDHKeyPair();
        ecdhKeysRef.current = keyPair;

        // 2. Export Public Key
        const pubBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
        const pubBase64 = cryptoManager.arrayBufferToBase64(pubBuffer);

        // 3. Emit Request
        console.log('[Sync] Emitting request_key_sync...');
        socket.emit('request_key_sync', pubBase64);

        // 4. Update mode to approve
        setSyncState(prev => ({ ...prev, active: true, mode: 'approve' }));

        // [MODIFIED] Do not set timeout here. Wait for 'sync:target_count' from server.
    }, [socket, token, showNotification]);
    const activeRoomRef = useRef(null);
    const canNotifyRef = useRef(canNotify); // Track current notification state for socket handler

    // [NEW] Get pending unlock status for mobile layout
    const { pendingUnlockRoom } = useChatLock();
    
    // Resize Logic
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebar_width');
        return saved ? parseInt(saved, 10) : 288;
    }); // Default w-72 (288px)
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef(null);

    // Persist width
    useEffect(() => {
        localStorage.setItem('sidebar_width', sidebarWidth);
    }, [sidebarWidth]);

    // [NEW] Helper to sort rooms: Pinned first (by pin time), then by last message/creation time
    const sortRooms = (roomsToSort) => {
        return [...roomsToSort].sort((a, b) => {
            // 1. Pinned
            const isPinnedA = !!a.is_pinned;
            const isPinnedB = !!b.is_pinned;
            if (isPinnedA && !isPinnedB) return -1;
            if (!isPinnedA && isPinnedB) return 1;

            if (isPinnedA && isPinnedB) {
                 // Sort by pin time (desc) - "Stack" behavior
                 const pinTimeA = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
                 const pinTimeB = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
                 
                 if (pinTimeA !== pinTimeB) {
                     return pinTimeB - pinTimeA;
                 }
                 // Tie-breaker: Fallback to last message time
            }

            // 2. Archived (Though archived usually hidden or filtered, we sort them last just in case)
            const isArchivedA = !!a.is_archived;
            const isArchivedB = !!b.is_archived;
            if (isArchivedA && !isArchivedB) return 1;
            if (!isArchivedA && isArchivedB) return -1;
            
            // 3. Time (desc)
            const timeA = new Date(a.last_message_at || a.created_at).getTime();
            const timeB = new Date(b.last_message_at || b.created_at).getTime();
            return timeB - timeA;
        });
    };

    // Keep canNotifyRef in sync with canNotify (fixes stale closure in socket handler)
    useEffect(() => {
        canNotifyRef.current = canNotify;
    }, [canNotify]);

    const resize = useCallback((mouseMoveEvent) => {
        // Optimization: RequestAnimationFrame could be used here if needed, but setState is usually fast enough
        // [MODIFIED] Subtract SideNav width (64px) from clientX to account for the left panel
        const SIDENAV_WIDTH = 64; // w-16 = 64px
        const newWidth = mouseMoveEvent.clientX - SIDENAV_WIDTH;
        if (newWidth >= 200 && newWidth <= 600) {
            setSidebarWidth(newWidth);
        }
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        document.body.style.cursor = 'default';
        window.removeEventListener("mousemove", resize);
        window.removeEventListener("mouseup", stopResizing);
    }, [resize]);

    const startResizing = useCallback((e) => {
        e.preventDefault(); // Prevent text selection
        setIsResizing(true);
        document.body.style.cursor = 'col-resize'; // Force cursor on body
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
    }, [resize, stopResizing]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    useEffect(() => {
        activeRoomRef.current = activeRoom;
        setShowGroupInfo(false); // Close group info modal when changing rooms
    }, [activeRoom]);

    const fetchRooms = useCallback(async (showLoading = false) => {
        if (!token) return;
        if (showLoading) setIsLoadingRooms(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                
                // [OPTIMIZATION] Parallel Key Pre-fetch
                // This triggers the IndexedDB fetch for all rooms at once
                try {
                    await cryptoManager.prefetchKeys(data);
                } catch (e) {
                    console.warn('[Dashboard] Key prefetch failed:', e);
                }

                if (Array.isArray(data)) {
                    const enriched = data.map(room => ({
                        ...room,
                        official_last_message: {
                            id: room.last_message_id,
                            content: room.last_message_content,
                            type: room.last_message_type,
                            ciphertext: room.last_message_ciphertext,
                            iv: room.last_message_iv,
                            salt: room.last_message_salt,
                            key_version: room.last_message_key_version,
                            temp_id: room.last_message_temp_id,
                            reactions: room.last_message_reactions,
                            created_at: room.last_message_at,
                            user_id: room.last_message_sender_id,
                            sender_name: room.last_message_sender_name,
                            status: room.last_message_status,
                            caption: room.last_message_caption,
                            file_name: room.last_message_file_name,
                            is_view_once: room.last_message_is_view_once,
                            viewed_by: room.last_message_viewed_by,
                            attachments: room.last_message_attachments,
                            poll_question: room.last_message_poll_question
                        }
                    }));
                    
                    // [OPTIMIZATION] Decryption now happens at component-level for faster UI load
                    // Removing the blocking Promise.all here allows the dashboard to render instantly
                    setRooms(prev => {
                        return enriched.map(newRoom => {
                            const existing = prev.find(r => String(r.id) === String(newRoom.id));
                            if (existing) {
                                // [NEW] Preserve plaintext from UI state if not in server response
                                const plaintext = newRoom.last_message_plaintext || 
                                                 (newRoom.last_message_id === existing.last_message_id ? existing.last_message_plaintext : null);

                                if (isStatusWorse(newRoom.last_message_status, existing.last_message_status)) {
                                    return { 
                                        ...newRoom, 
                                        last_message_status: existing.last_message_status,
                                        last_message_plaintext: plaintext
                                    };
                                }
                                return { ...newRoom, last_message_plaintext: plaintext };
                            }
                            return newRoom;
                        });
                    });
                    
                    // [FIX] Return enriched data so callers can use it immediately (for wait logic)
                    return enriched;
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingRooms(false);
        }
    }, [token]);

    // Fetch rooms on mount
    useEffect(() => {
        fetchRooms(true); 
    }, [fetchRooms]);

    const syncAttemptedRef = useRef(false);

    // Check if backup exists
    useEffect(() => {
        if (!socket || syncAttemptedRef.current || hasSkippedSync) return;
        
        const checkRestoreStatus = async () => {
            const count = await countRoomKeys();
            if (count > 0) return; // Already have keys
            
            syncAttemptedRef.current = true; // Prevent loop

            // [FIX] Always check cloud backup first for ALL users (not just OAuth)
            // This ensures keys are synced before showing messages
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                // If backup exists, trigger Restore Modal
                if (res.ok) {
                    const data = await res.json();
                    if (data && (data.encrypted_blob || data.hasBackup)) {
                        console.log('[Restore] Backup found. Prompting restore...');
                        setShowRestoreModal(true);
                        return;
                    }
                }
            } catch (err) {
                console.warn('[Restore] Failed to check backup status:', err);
            }

            // Fallback: P2P Device Sync (if no cloud backup exists)
            console.log('[Sync] No cloud backup found. Starting Device Sync...');
            setTimeout(() => {
                 triggerSync();
            }, 1500);
        };

        checkRestoreStatus();
    }, [socket, triggerSync, token, hasSkippedSync, user]);

    useEffect(() => {
        // [FIX] robust check for deviceId
        const deviceId = cryptoManager.deviceId;
        
        console.log(`[Dashboard] Initializing Socket. token=${!!token} deviceId=${deviceId}`);
        
        const newSocket = io(import.meta.env.VITE_API_URL, {
            auth: { 
                token,
                deviceId: deviceId 
            },
            // Force transport to avoid some proxy issues if any
            transports: ['websocket', 'polling'] 
        });

        newSocket.on('connect', () => {
            console.log(`[Dashboard] Socket connected! ID=${newSocket.id} DeviceID=${deviceId}`);
            if (!deviceId) {
                console.error('[Dashboard] Socket connected WITHOUT DeviceID! Sync will fail.');
            }
        });

        newSocket.on('connect_error', (err) => {
            console.error('[DEBUG] Socket connection error:', err.message);
        });

        // Helper moved to component scope


        newSocket.on('room_added', (newRoom) => {
            console.log('[DEBUG-CLIENT] room_added received:', newRoom);
            setRooms(prev => {
                if (prev.find(r => String(r.id) === String(newRoom.id))) return prev;
                return sortRooms([newRoom, ...prev]);
            });
            newSocket.emit('join_room', newRoom.id);
        });

        // ... existing listeners ...


        // [NEW] Serial Queue Processing
        const processOfflineQueue = async () => {
             if (!newSocket.connected) return;
             console.log('[Offline] Processing queue...');
             const pending = await getPendingMessages();
             
             pending.sort((a, b) => {
                 const tA = parseInt(a.tempId?.split('-')[1] || 0);
                 const tB = parseInt(b.tempId?.split('-')[1] || 0);
                 return tA - tB;
             });

             for (const msg of pending) {
                 try {
                     if (!newSocket.connected) break;
                     
                     // [FIX] For media messages (image, file, audio, gif), mark as 'error' so user can retry
                     // These need HTTP uploads which can't be replayed via socket
                     if (msg.type && msg.type !== 'text' && msg.type !== 'location' && msg.type !== 'poll') {
                         // Media messages need to be retried manually (they have localBlob)
                         if (msg.status === 'pending' || msg.status === 'sending') {
                             await updateLocalMessage(msg.tempId || msg.id, { 
                                 status: 'error',
                                 uploadStatus: 'failed'
                             });
                             console.log(`[Offline] Media message ${msg.tempId} marked for retry`);
                         }
                         continue;
                     }
                     
                     // [FIX] Include created_at in payload to preserve message position
                     const payload = { ...msg, created_at: msg.created_at };
                     
                     await new Promise((resolve, reject) => {
                         const timeout = setTimeout(() => reject(new Error('ACK Timeout')), 5000);
                         newSocket.emit('send_message', payload, (response) => {
                             clearTimeout(timeout);
                             if (response && response.status === 'ok') resolve(response);
                             else reject(new Error(response?.error || 'Server Error'));
                         });
                     });
                     
                     // [FIX] Update Dexie status after successful send
                     await updateLocalMessage(msg.tempId || msg.id, { 
                         status: 'sent',
                         id: msg.tempId // Keep the same ID for now, server will update via socket
                     });
                     await deletePendingMessage(msg.tempId);
                     console.log(`[Offline] Synced message ${msg.tempId}`);
                     setRooms(prev => prev.map(r => {
                         if (String(r.id) === String(msg.roomId || msg.room_id) && String(r.last_message_id) === String(msg.tempId)) {
                             return { ...r, last_message_status: 'sent' };
                         }
                         return r;
                     }));
                 } catch (err) {
                     console.warn(`[Offline] Sync failed for ${msg.tempId}:`, err);
                     // [FIX] Mark as error so user can see it failed
                     await updateLocalMessage(msg.tempId || msg.id, { status: 'error' });
                     break; 
                 }
             }
        };

        newSocket.on('connect', processOfflineQueue);
        window.addEventListener('online', processOfflineQueue);


        // [NEW] Force refresh rooms list (fallback for syncing)
        newSocket.on('rooms:refresh', () => {
             console.log('[DEBUG-CLIENT] rooms:refresh received. Fetching data...');
             const fetchData = async () => {
                try {
                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const enriched = data.map(room => ({
                            ...room,
                            official_last_message: {
                                id: room.last_message_id,
                                content: room.last_message_content,
                                type: room.last_message_type,
                                ciphertext: room.last_message_ciphertext,
                                iv: room.last_message_iv,
                                salt: room.last_message_salt,
                                key_version: room.last_message_key_version,
                                temp_id: room.last_message_temp_id,
                                reactions: room.last_message_reactions,
                                created_at: room.last_message_at,
                                user_id: room.last_message_sender_id,
                                sender_name: room.last_message_sender_name,
                                status: room.last_message_status,
                                caption: room.last_message_caption,
                                file_name: room.last_message_file_name,
                                is_view_once: room.last_message_is_view_once,
                                viewed_by: room.last_message_viewed_by,
                                attachments: room.last_message_attachments,
                                poll_question: room.last_message_poll_question
                            }
                        }));
                        setRooms(prev => {
                            return enriched.map(newRoom => {
                                const existing = prev.find(r => String(r.id) === String(newRoom.id));
                                if (existing && isStatusWorse(newRoom.last_message_status, existing.last_message_status)) {
                                    return { 
                                        ...newRoom, 
                                        last_message_status: existing.last_message_status,
                                        last_message_plaintext: newRoom.last_message_id === existing.last_message_id ? (newRoom.last_message_plaintext || existing.last_message_plaintext) : newRoom.last_message_plaintext
                                    };
                                }
                                return newRoom;
                            });
                        }); 
                    }
                } catch (err) {
                    console.error(err);
                }
            };
            fetchData();
        });

        newSocket.on('message_viewed', async ({ id, room_id, viewed_by }) => {
            await updateLocalMessage(id, { viewed_by });
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(room_id) && String(r.last_message_id) === String(id)) {
                    return { ...r, last_message_viewed_by: viewed_by };
                }
                return r;
            }));
        });

        newSocket.on('new_message', async (msg) => {
            const isSilent = msg.meta?.silent;

            // [PHASE 3] Global Replay Protection
            const gatekeeperId = msg.sender_device_id ? `${msg.sender_device_id}:${msg.temp_id}` : `unsigned:${msg.temp_id || msg.id}`;
            if (seenMessages.current.has(gatekeeperId)) {
                return; // Duplicate
            }
            seenMessages.current.add(gatekeeperId);

            // [PHASE 3] Global Persistence (Background Processing)
            const processedMsg = await processIncomingMessage(msg);
            await saveLocalMessage(processedMsg);

            // Notification / Sound logic
            if (msg.user_id !== user.id && !isSilent) {
                const audio = new Audio(notificationSound);
                audio.play().catch(e => console.log("Audio play error:", e));
                
                const isTabHidden = document.hidden;
                const isDifferentRoom = activeRoomRef.current?.id !== msg.room_id;
                
                if (canNotifyRef.current && (isTabHidden || isDifferentRoom)) {
                    const senderRoom = rooms.find(r => String(r.id) === String(msg.room_id));
                    if (senderRoom?.is_archived) return;
                    
                    const senderName = msg.display_name || msg.username || 'Someone';
                    const title = (senderRoom && senderRoom.type === 'group') 
                        ? `${senderName} @${senderRoom.name || 'Group'}`
                        : `@${senderName}`;
                    
                    showNotification(title, {
                        body: getMessagePreview(processedMsg),
                        icon: msg.avatar_thumb_url || senderRoom?.avatar_thumb_url || '/logo.png',
                        tag: `room-${msg.room_id}`,
                        data: { roomId: msg.room_id },
                        onClick: (data) => {
                            const targetRoom = rooms.find(r => String(r.id) === String(data.roomId));
                            if (targetRoom) handleSelectRoom(targetRoom);
                        }
                    });
                }
            } else if (msg.user_id === user.id) {
                const audio = new Audio(sentSound);
                audio.play().catch(e => console.log("Audio play error:", e));
            }

            // Update Rooms State (Sidebar)
            setRooms(prev => {
                let updatedRooms = [...prev];
                const roomIndex = updatedRooms.findIndex(r => String(r.id) === String(msg.room_id));
                
                if (String(msg.user_id) !== String(user.id) && !isSilent) {
                    newSocket.emit('message_delivered', { messageId: msg.id, roomId: msg.room_id });
                }

                if (roomIndex > -1) {
                     const room = { ...updatedRooms[roomIndex] };
                      const isActiveRoom = activeRoomRef.current && String(activeRoomRef.current.id) === String(room.id);
                      const isOwnMessage = String(msg.user_id) === String(user.id);
                      // [FIX] Don't increment unread_count for our own messages (from other devices)
                      if (!isActiveRoom && !isSilent && !isOwnMessage) {
                          room.unread_count = (room.unread_count || 0) + 1;
                          if (msg.mention_user_ids?.map(Number).includes(Number(user.id))) {
                              room.mention_count = (room.mention_count || 0) + 1;
                          }
                      } else if (isActiveRoom) {
                         room.unread_count = 0;
                         room.mention_count = 0;
                         fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/read`, {
                             method: 'POST',
                             headers: { Authorization: `Bearer ${token}` }
                         }).catch(console.error);
                      }
                      
                      const isSameMessage = String(room.last_message_id) === String(msg.id) || 
                          String(room.last_message_id) === String(msg.temp_id || msg.tempId) ||
                          String(room.last_message_id) === String(msg.tempId);
                      
                      // [FIX] Check if this is our own message echo (server confirming our sent message)
                      const isOwnMessageEcho = String(msg.user_id) === String(user.id) && 
                          (msg.temp_id || msg.tempId) && 
                          (String(room.last_message_id) === String(msg.temp_id || msg.tempId) || 
                           room.last_message_status === 'sending');
                      
                      // [FIX] Prevent older messages from overwriting newer optimistic updates
                      // Use server timestamps (created_at) for comparison to avoid client/server time drift
                      const incomingMsgTime = new Date(msg.created_at).getTime();
                      const currentMsgTime = room.last_message_created_at ? new Date(room.last_message_created_at).getTime() : 0;
                      const isOlderMessage = incomingMsgTime < currentMsgTime && !isSameMessage && !isOwnMessageEcho;
                      
                      if (isOlderMessage) {
                          // This is an older message arriving late, don't update sidebar preview
                          // But still update official_last_message for reference if needed
                          updatedRooms[roomIndex] = room;
                          return updatedRooms;
                      }
                      
                      let newContent = processedMsg.content || (processedMsg.ciphertext ? '🔒 Encrypted Message' : processedMsg.content);
                      
                      // [FIX] Preserve our optimistic content when receiving echo of our own message
                      if (isOwnMessageEcho && room.last_message_content && room.last_message_content !== '🔒 Encrypted Message') {
                          newContent = room.last_message_content;
                      }
                      
                      room.last_message_content = newContent;
                      // [NEW] Cache plaintext for instant sidebar rendering
                      room.last_message_plaintext = processedMsg.plaintext_content || newContent;
                      room.last_message_type = msg.type;
                      
                      // [NEW] Downgrade protection for last_message_status
                      const incomingStatus = msg.status || 'sent';
                      if (!room.last_message_id || String(room.last_message_id) !== String(msg.id) || !isStatusWorse(incomingStatus, room.last_message_status)) {
                          room.last_message_status = incomingStatus;
                      }
                      
                      room.last_message_id = msg.id;
                      room.last_message_sender_id = String(msg.user_id);
                      room.last_message_sender_name = msg.display_name || msg.username || 'Someone';
                      room.last_message_is_deleted = false;
                      room.last_message_at = isSilent ? room.last_message_at : new Date().toISOString();
                      room.last_message_created_at = msg.created_at; // [FIX] Set created_at for reaction comparison
                      
                      // [FIX] Clear latest_reaction so new message shows instead of old reaction
                      if (!isSilent) {
                          room.latest_reaction = null;
                          // [FIX] Clear last_message_reactions since new message has no reactions yet
                          room.last_message_reactions = [];
                      }
                      
                      // Handle media specific metadata for sidebar
                      if (msg.caption !== undefined) room.last_message_caption = msg.caption;
                      if (msg.file_name !== undefined) room.last_message_file_name = msg.file_name;
                      if (msg.is_view_once !== undefined) room.last_message_is_view_once = msg.is_view_once;
                      if (msg.viewed_by !== undefined) room.last_message_viewed_by = msg.viewed_by;
                      if (msg.attachments_count !== undefined) room.last_message_attachments_count = msg.attachments_count;
                      else if (msg.attachments) room.last_message_attachments_count = msg.attachments.length;

                      // [FIX] Update encryption fields so Sidebar can decrypt real-time messages
                      room.last_message_ciphertext = processedMsg.ciphertext;
                      room.last_message_iv = processedMsg.iv;
                      room.last_message_key_version = processedMsg.key_version;
                      room.last_message_temp_id = processedMsg.temp_id;
                      // Ensure salt is set (usually temp_id or id)
                      room.last_message_salt = processedMsg.salt || processedMsg.temp_id || processedMsg.id;

                      room.official_last_message = { ...processedMsg, id: processedMsg.id };
                      updatedRooms[roomIndex] = room;
                      return isSilent ? updatedRooms : sortRooms(updatedRooms);
                }
                return updatedRooms;
            });
        });

        // [NEW] Handle Message Edit (Updates Sidebar & BACKGROUND DEXIE)
        newSocket.on('message_edited', async (msg) => {
            // 1. Update Dexie
            try {
                const processed = await processIncomingMessage(msg);
                await updateLocalMessage(msg.id, { 
                    ...processed,
                    isDecrypted: true,
                    edited_at: msg.edited_at,
                    edit_version: msg.edit_version
                });
            } catch (e) { console.error("Failed to patch Dexie for edit", e); }

            // 2. Update Sidebar State (Existing Logic)
            setRooms(prev => {
                const updatedRooms = [...prev];
                const roomIndex = updatedRooms.findIndex(r => String(r.id) === String(msg.room_id));
                
                if (roomIndex > -1) {
                    const room = { ...updatedRooms[roomIndex] };
                    // Only update if the edited message IS the last message
                    if (String(room.last_message_id) === String(msg.id)) {
                         room.last_message_content = msg.content || (msg.ciphertext ? '🔒 Encrypted Message' : msg.content);
                         // [NEW] Cache plaintext for instant sidebar rendering
                         room.last_message_plaintext = processed.plaintext_content || room.last_message_content;
                         room.last_message_sender_id = String(msg.user_id);
                         room.last_message_sender_name = msg.display_name || msg.username || room.last_message_sender_name;
                         if (msg.caption !== undefined) {
                             room.last_message_caption = msg.caption;
                         }
                         updatedRooms[roomIndex] = room;
                         return updatedRooms; // No sorting needed for edit
                    }
                }
                return prev;
            });
        });

        // [NEW] Handle message deletion update (Sidebar & BACKGROUND DEXIE)
        newSocket.on('message_deleted', async ({ messageId, is_deleted_for_everyone, roomId }) => {
            // 1. Update Dexie
            await updateLocalMessage(messageId, { is_deleted_for_everyone: true, content: "" });

            if (!is_deleted_for_everyone) return;
            
            // 2. Update Sidebar
            setRooms(prev => {
                const updatedRooms = [...prev];
                // Find if any room has this message as the last message
                const roomIndex = updatedRooms.findIndex(r => String(r.last_message_id) === String(messageId));
                
                if (roomIndex > -1) {
                    const room = { ...updatedRooms[roomIndex] };
                    room.last_message_is_deleted = true;
                    updatedRooms[roomIndex] = room;
                    return updatedRooms; // No need to re-sort usually
                }
                return prev;
            });
        });

        // [NEW] Message Viewed (for View Once updates)
        newSocket.on('message_viewed', ({ id, room_id, userId, viewed_by }) => {
             setRooms(prev => prev.map(r => {
                 if (String(r.id) === String(room_id) && String(r.last_message_id) === String(id)) {
                     const updatedArray = viewed_by || [...(r.last_message_viewed_by || []), userId];
                     return { ...r, last_message_viewed_by: updatedArray };
                 }
                 return r;
             }));

             // [NEW] Also update activeRoom for real-time bubble color/status change if it was the last message
             setActiveRoom(prev => {
                 if (prev && String(prev.id) === String(room_id) && String(prev.last_message_id) === String(id)) {
                     const updatedArray = viewed_by || [...(prev.last_message_viewed_by || []), userId];
                     return { ...prev, last_message_viewed_by: updatedArray };
                 }
                 return prev;
             });
        });

        // [NEW] Avatar Updates
        newSocket.on('user:avatar:updated', ({ userId, avatar_url, avatar_thumb_url }) => {
             console.log('[DEBUG] Avatar updated for user', userId, avatar_thumb_url);
             
             // Update global user state if it's us (multi-device sync)
             if (user && String(userId) === String(user.id)) {
                 updateUser({ avatar_url, avatar_thumb_url });
             }

             setRooms(prev => prev.map(r => {
                 if (r.type === 'direct' && String(r.other_user_id) === String(userId)) {
                     return { ...r, avatar_thumb_url };
                 }
                 return r;
             }));
             
             setActiveRoom(prev => {
                 if (prev && prev.type === 'direct' && String(prev.other_user_id) === String(userId)) {
                     return { ...prev, avatar_thumb_url, avatar_url }; // Update both
                 }
                 return prev;
             });
        });

        newSocket.on('user:avatar:deleted', ({ userId }) => {
             // Update global user state if it's us (multi-device sync)
             if (user && String(userId) === String(user.id)) {
                 updateUser({ avatar_url: null, avatar_thumb_url: null });
             }

             setRooms(prev => prev.map(r => {
                 if (r.type === 'direct' && String(r.other_user_id) === String(userId)) {
                     return { ...r, avatar_thumb_url: null };
                 }
                 return r;
             }));
             
             setActiveRoom(prev => {
                 if (prev && prev.type === 'direct' && String(prev.other_user_id) === String(userId)) {
                     return { ...prev, avatar_thumb_url: null, avatar_url: null };
                 }
                 return prev;
             });
        });

        // [NEW] Session Revocation Handling
        newSocket.on('session:revoked', ({ sessionId }) => {
             console.log('[DEBUG-CLIENT] session:revoked received', sessionId);
             try {
                if (!token) return;
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const payload = JSON.parse(window.atob(base64));
                
                if (payload.sessionId === sessionId) {
                    console.log('[DEBUG-CLIENT] My session revoked. Logging out...');
                    logout();
                }
             } catch (e) {
                 console.error('Error processing session revocation:', e);
             }
        });

        newSocket.on('session:revoked-others', ({ currentSessionId }) => {
            console.log('[DEBUG-CLIENT] session:revoked-others received, keeping:', currentSessionId);
            try {
                if (!token) return;
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const payload = JSON.parse(window.atob(base64));
                
                if (payload.sessionId !== currentSessionId) {
                    console.log('[DEBUG-CLIENT] I am one of the "others". Logging out...');
                    logout();
                }
            } catch (e) {
                console.error(e);
            }
        });

        // [NEW] Real-time Sidebar Reaction Updates & Dexie Persistence
        newSocket.on('message:reaction_update', ({ roomId, messageId, userId, reaction, username, display_name, avatar_thumb_url, ...metadata }) => {
            const filter = (r) => String(r.userId || r.user_id || '') !== String(userId);
            const newReactionObj = reaction ? { 
                userId, 
                reaction, 
                username, 
                display_name, 
                avatar_thumb_url, 
                created_at: new Date().toISOString() 
            } : null;

            // 1. Update Sidebar state (INSTANT / OPTIMISTIC)
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(roomId)) {
                    const updates = {};
                    
                    // Update last_message_reactions if this is the last message
                    if (String(r.last_message_id) === String(messageId)) {
                        const current = r.last_message_reactions || [];
                        updates.last_message_reactions = reaction ? [newReactionObj, ...current.filter(filter)] : current.filter(filter);
                    }
                    
                    // [NEW] Also track latest reaction for any message (for sidebar notification)
                    if (reaction) {
                        updates.latest_reaction = {
                            emoji: reaction,
                            message_id: messageId,
                            user_id: userId,
                            display_name: display_name || username,
                            timestamp: new Date().toISOString(),
                            // [NEW] Include message content for sidebar preview
                            message_content: metadata.message_content,
                            message_type: metadata.message_type,
                            message_file_name: metadata.message_file_name,
                            message_ciphertext: metadata.message_ciphertext,
                            message_iv: metadata.message_iv,
                            message_key_version: metadata.message_key_version,
                            message_temp_id: metadata.message_temp_id
                        };
                    } else {
                        // [NEW] Clear latest_reaction when reaction is removed
                        // Only clear if this unreact is for the same message as the current latest_reaction
                        if (r.latest_reaction && String(r.latest_reaction.message_id) === String(messageId)) {
                            updates.latest_reaction = null;
                        }
                    }
                    
                    return { ...r, ...updates };
                }
                return r;
            }));

            // 2. Update Active Room state (INSTANT / OPTIMISTIC)
            setActiveRoom(prev => {
                if (!prev || String(prev.id) !== String(roomId)) return prev;

                const updatedRoom = { ...prev };
                // Update official_last_message reactions if it matches
                if (updatedRoom.official_last_message && String(updatedRoom.official_last_message.id) === String(messageId)) {
                    const current = updatedRoom.official_last_message.reactions || [];
                    updatedRoom.official_last_message.reactions = reaction ? [newReactionObj, ...current.filter(filter)] : current.filter(filter);
                }
                
                // Sync localStorage cache
                const cacheKey = `chat_messages_${roomId}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const messages = JSON.parse(cached);
                        const updatedCache = messages.map(m => {
                            if (String(m.id) === String(messageId)) {
                                const current = m.reactions || [];
                                const next = reaction ? [newReactionObj, ...current.filter(filter)] : current.filter(filter);
                                return { ...m, reactions: next };
                            }
                            return m;
                        });
                        localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
                    } catch (e) {
                         // Silent fail for cache
                    }
                }

                return updatedRoom;
            });

            // 3. Persist to Dexie in BACKGROUND (non-blocking)
            (async () => {
                try {
                    const msg = await db.messages.where('id').equals(String(messageId)).first();
                    if (msg) {
                        const current = msg.reactions || [];
                        const next = reaction ? [newReactionObj, ...current.filter(filter)] : current.filter(filter);
                        await updateLocalMessage(messageId, { reactions: next });
                    }
                } catch (err) {
                    console.warn('[Dexie] Background reaction update failed:', err);
                }
            })();
        });

        // [NEW] Batch Status Updates (e.g. from server sync)
        newSocket.on('messages_status_update', async ({ roomId, messageIds, status }) => {
            // 1. Update Dexie
            for (const id of messageIds) {
                await updateLocalMessage(id, { status });
            }

            // 2. Update Sidebar
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(roomId) && r.last_message_id && messageIds.map(String).includes(String(r.last_message_id))) {
                    // Downgrade protection
                    if (r.last_message_status === 'seen' && status !== 'seen') return r;
                    if (r.last_message_status === 'delivered' && status === 'sent') return r;
                    return { ...r, last_message_status: status };
                }
                return r;
            }));

            // [NEW] Update Active Room state if it matches
            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(roomId)) {
                setActiveRoom(prev => ({ ...prev })); // Trigger re-render to pick up Dexie changes
            }
        });

        // [NEW] Real-time Delivery Receipt
        newSocket.on('message:delivered', async ({ messageId, roomId }) => {
            // 1. Update Dexie
            await updateLocalMessage(messageId, { status: 'delivered' });

            // 2. Update Sidebar
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(roomId) && String(r.last_message_id) === String(messageId)) {
                    if (r.last_message_status === 'seen') return r;
                    return { ...r, last_message_status: 'delivered' };
                }
                return r;
            }));

            // [NEW] Update Active Room state if it matches
            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(roomId)) {
                setActiveRoom(prev => ({ ...prev })); // Trigger re-render
            }
        });

        // [NEW] Sync read status to room state (fixes stale divider on re-entry)
        newSocket.on('chat:read-update', ({ chatId, lastReadMessageId }) => {
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(chatId)) {
                    return { ...r, last_read_message_id: lastReadMessageId };
                }
                return r;
            }));
        });

        // [NEW] Real-time Read Receipt (Seen)
        newSocket.on('message:read_receipt', async ({ roomId, messageIds }) => {
             // 1. Update Dexie
             const ids = messageIds.map(String);
             for (const id of ids) {
                 await updateLocalMessage(id, { status: 'seen' });
             }

             // 2. Update Sidebar
             setRooms(prev => prev.map(r => {
                if (String(r.id) === String(roomId) && r.last_message_id && ids.includes(String(r.last_message_id))) {
                     return { ...r, last_message_status: 'seen' };
                }
                return r;
            }));

            // [NEW] Update Active Room state if it matches
            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(roomId)) {
                setActiveRoom(prev => ({ ...prev })); // Trigger re-render
            }
        });

        newSocket.on('chat:cleared', async ({ roomId }) => {
            // Update rooms list
            setRooms(prev => prev.map(r => 
                String(r.id) === String(roomId) ? { 
                    ...r, 
                    unread_count: 0, 
                    mention_count: 0,
                    initialMessages: [],
                    last_message_content: null,
                    last_message_type: null,
                    last_message_sender_id: null,
                    last_message_sender_name: null,
                    last_message_status: null,
                    last_message_id: null,
                    last_message_caption: null,
                    last_message_file_name: null,
                    last_message_is_view_once: null,
                    last_message_viewed_by: null,
                    last_message_poll_question: null,
                    last_message_attachments: null,
                    last_message_attachments_count: 0,
                    last_message_is_deleted: false,
                    last_message_temp_id: null,
                    last_message_plaintext: null,
                    last_message_ciphertext: null,
                    last_message_iv: null,
                    last_message_key_version: null,
                    last_message_reactions: null,
                    latest_reaction: null
                } : r
            ));
            
            // Update active room if matches
            setActiveRoom(prev => {
                if (prev && String(prev.id) === String(roomId)) {
                    return { ...prev, initialMessages: [], last_message_id: null };
                }
                return prev;
            });

            // [FIX] Clear local Dexie cache for this room on this device
            try {
                await db.messages.where('room_id').equals(String(roomId)).delete();
                await db.rooms.update(parseInt(roomId), {
                    last_message_id: null,
                    last_message_content: null,
                    last_message_plaintext: null,
                    last_message_ciphertext: null,
                    last_message_iv: null,
                    last_message_type: null,
                    last_message_sender_id: null,
                    last_message_created_at: null,
                    last_message_reactions: null,
                    latest_reaction: null
                });
            } catch (e) {
                console.warn('[Sync] Could not clear Dexie cache on socket event:', e);
            }
        });

        newSocket.on('chat:deleted', async ({ roomId }) => {
            setRooms(prev => prev.filter(r => String(r.id) !== String(roomId)));
            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(roomId)) {
                setActiveRoom(null);
            }

            // [FIX] Also clear local Dexie data for this room
            try {
                await db.messages.where('room_id').equals(String(roomId)).delete();
                // Optionally hide or delete from db.rooms too
                await db.rooms.update(parseInt(roomId), {
                    is_hidden: 1, 
                    last_message_id: null,
                    last_message_content: null,
                    last_message_plaintext: null,
                    last_message_reactions: null,
                    latest_reaction: null
                });
            } catch (e) {
                console.warn('[Sync] Could not clear Dexie for deleted chat:', e);
            }
        });

        // [NEW] Refresh rooms if last message is deleted (for everyone)
        newSocket.on('message_deleted', ({ messageId, roomId }) => {
             // Check if the deleted message was the last one shown in sidebar
             // determining from current state is hard inside callback due to closure
             // But setRooms(prev => ...) gives access to latest.
             // However, to trigger fetchRooms(), we need to call it.
             // We can just call fetchRooms(). It's debounced/throttled or just safe enough.
             // But let's check rooms state first if possible.
             // Actually, simplest is just to refresh.
             fetchRooms();
        });

        // [NEW] Handle Message Edited (Update Sidebar Preview)
        newSocket.on('message_edited', (updatedMsg) => {
             setRooms(prev => prev.map(r => {
                 if (String(r.id) === String(updatedMsg.room_id) && String(r.last_message_id) === String(updatedMsg.id)) {
                     return {
                         ...r,
                         last_message_content: updatedMsg.ciphertext ? '' : updatedMsg.content,
                         last_message_caption: updatedMsg.caption,
                         last_message_ciphertext: updatedMsg.ciphertext,
                         last_message_iv: updatedMsg.iv,
                         last_message_key_version: updatedMsg.key_version,
                         last_message_temp_id: updatedMsg.temp_id
                     };
                 }
                 return r;
             }));
             
             // Also update local cache if exists
             try {
                const cacheKey = `chat_messages_${updatedMsg.room_id}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    const newCache = parsed.map(m => String(m.id) === String(updatedMsg.id) ? { 
                        ...m, 
                        content: updatedMsg.content,
                        caption: updatedMsg.caption,
                        ciphertext: updatedMsg.ciphertext,
                        iv: updatedMsg.iv,
                        key_version: updatedMsg.key_version,
                        edited_at: updatedMsg.edited_at,
                        edit_version: updatedMsg.edit_version
                    } : m);
                    localStorage.setItem(cacheKey, JSON.stringify(newCache));
                }
             } catch(e) {}
        });

        // [NEW] Force refresh rooms list (fallback for syncing)
        newSocket.on('rooms:refresh', () => {
            console.log('[DEBUG] Received rooms:refresh request');
            fetchRooms();
        });

        // [NEW] Handle real-time block/unblock (to update online status visibility in sidebar)
        newSocket.on('you_are_blocked', ({ blockerId }) => {
            setRooms(prevRooms => prevRooms.map(r => {
                if (String(r.other_user_id) === String(blockerId)) {
                    return { ...r, is_blocked_by_them: true };
                }
                return r;
            }));
        });

        newSocket.on('you_are_unblocked', ({ blockerId }) => {
            setRooms(prevRooms => prevRooms.map(r => {
                if (String(r.other_user_id) === String(blockerId)) {
                    return { ...r, is_blocked_by_them: false };
                }
                return r;
            }));
        });

        // [NEW] Poll vote - update chat list with "voted in" preview
        // ChatWindow now uses named handlers so it won't remove this listener
        newSocket.on('poll_vote', ({ roomId, pollId, poll, voterId, voterName, pollQuestion, hasVoted, lastMessage }) => {
            // Clear the message cache for this room so fresh data is fetched when chat is opened
            localStorage.removeItem(`chat_messages_${roomId}`);
            
            // Update sidebar preview
            setRooms(currentRooms => {
                const newRooms = currentRooms.map(room => {
                    if (String(room.id) === String(roomId)) {
                        // [FIX] Use authoritative lastMessage from server to correctly display "You voted" OR "Previous Message" (on unvote)
                        if (lastMessage) {
                                return {
                                    ...room,
                                    last_message_content: lastMessage.content,
                                    last_message_type: lastMessage.type,
                                    last_message_sender_id: lastMessage.sender_id,
                                    last_message_sender_name: lastMessage.sender_name,
                                    last_message_poll_question: lastMessage.poll_question,
                                    // Use the message time, or fall back to now if missing (shouldn't be missing)
                                    last_message_at: lastMessage.created_at || new Date().toISOString()
                                };
                        }

                        // Fallback logic for legacy/compatibility
                        if (hasVoted) {
                            return {
                                ...room,
                                last_message_content: pollQuestion,
                                last_message_type: 'poll_vote',
                                last_message_sender_id: voterId,
                                last_message_sender_name: voterName,
                                last_message_poll_question: pollQuestion,
                                last_message_at: new Date().toISOString()
                            };
                        } else {
                            return {
                                ...room,
                                last_message_type: 'poll',
                                last_message_poll_question: pollQuestion,
                                last_message_sender_id: poll.created_by,
                                last_message_sender_name: poll.creator_name
                            };
                        }
                    }
                    return room;
                });
                return sortRooms(newRooms);
            });
        });
        
        // [NEW] Todo update - update chat list with "updated" preview 
        newSocket.on('todo_updated', ({ roomId, todoId, messageId, updaterId, updaterName, todoTitle, todo }) => {
            // Update sidebar preview
            setRooms(currentRooms => {
                const newRooms = currentRooms.map(room => {
                    if (String(room.id) === String(roomId)) {
                        return {
                            ...room,
                            last_message_content: todoTitle || 'To-Do List',
                            last_message_type: 'todo_updated',
                            last_message_sender_id: updaterId,
                            last_message_sender_name: updaterName,
                            last_message_todo_title: todoTitle,
                            last_message_at: new Date().toISOString()
                        };
                    }
                    return room;
                });
                return sortRooms(newRooms);
            });
        });

        // [NEW] Group Avatar/Bio Updates
        newSocket.on('room:updated', (data) => {
            // data matches: { roomId, avatar_url, avatar_thumb_url, bio, etc }
            console.log('[DEBUG] Room updated:', data);
            
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(data.roomId)) {
                    return { ...r, ...data }; // Merge updates (avatar, bio, etc)
                }
                return r;
            }));

            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(data.roomId)) {
                 setActiveRoom(prev => ({ ...prev, ...data }));
            }
        });

        // [NEW] Group Permissions Updated
        newSocket.on('group:permissions:updated', ({ groupId, permissions }) => {
            console.log('[DEBUG] Permissions updated:', groupId, permissions);
            
            setRooms(prev => prev.map(r => {
                if (String(r.id) === String(groupId)) {
                    return { ...r, ...permissions }; // Merge permissions (send_mode, etc) into room
                }
                return r;
            }));

            if (activeRoomRef.current && String(activeRoomRef.current.id) === String(groupId)) {
                 setActiveRoom(prev => ({ ...prev, ...permissions }));
            }
        });

        // [NEW] User Profile Updates (Display Name, Bio, Username)
        newSocket.on('user:profile:updated', ({ userId, display_name, bio, username }) => {
            console.log('[DEBUG] User profile updated:', userId, { display_name, bio, username });
            
            if (user && String(userId) === String(user.id)) {
                // [FIX] Only update fields that are actually present in the payload
                const updates = {};
                if (display_name !== undefined) updates.display_name = display_name;
                if (bio !== undefined) updates.bio = bio;
                if (username !== undefined) updates.username = username;
                
                if (Object.keys(updates).length > 0) {
                    updateUser(updates);
                }
            }

            // 1. Update Sidebar Rooms (for DMs)
            if (display_name !== undefined) {
                setRooms(prev => prev.map(r => {
                    if (r.type === 'direct' && String(r.other_user_id) === String(userId)) {
                        // Update the derived name for DMs
                        return { 
                            ...r, 
                            name: display_name,
                            other_user_name: display_name 
                        };
                    }
                    return r;
                }));

                // 2. Update Active Room if it is a DM with this user
                setActiveRoom(prev => {
                    if (prev && prev.type === 'direct' && String(prev.other_user_id) === String(userId)) {
                        return { 
                            ...prev, 
                            name: display_name,
                            other_user_name: display_name 
                        };
                    }
                    return prev;
                });
            }
        });
        // --- [PHASE 1] KEY SYNC HANDLERS (GLOBAL) ---
        // --- [PHASE 1] KEY SYNC HANDLERS (GLOBAL) ---
        newSocket.on('request_key_sync', async (payload) => {
            console.log(`[Sync] Received sync request for ${payload.targetDeviceId}`, payload);
            
            // [FIX] Ignore spurious requests if we JUST restored via password (prevent ghost session loops)
            const lastRestore = localStorage.getItem('last_restore_timestamp');
            if (lastRestore && (Date.now() - parseInt(lastRestore)) < 120000) { // 2 minutes grace period
                console.log('[Sync] Ignoring sync request due to recent manual restore');
                return;
            }

            console.log('[Sync] Setting pending request state', payload);
            setPendingSyncRequest(payload);
            
            // Force a browser notification as secondary alert
            showNotification('New Device Login', {
                body: `A new device is requesting to sync your chat history. Approve it in the app.`,
                requireInteraction: true,
                tag: 'sync-request'
            });
        });

        newSocket.on('provide_key_sync', async ({ encryptedBlob, senderPublicKey }) => {
            console.log('[Sync] Received encrypted key bundle!');
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

            try {
                setSyncState(prev => ({ ...prev, status: 'Decrypting history...' }));

                // 1. Derive Shared Secret
                const sharedKey = await cryptoManager.deriveSharedSyncKey(ecdhKeysRef.current.privateKey, senderPublicKey);
                
                // 2. Decrypt bundle
                const bundle = await cryptoManager.decryptSyncBundle(encryptedBlob, sharedKey);
                
                // 3. Import keys
                await cryptoManager.importKeysSync(bundle);
                
                // [FIX] Dispatch keys-updated event so sidebar components re-decrypt
                window.dispatchEvent(new CustomEvent('cipher:keys-updated', { 
                    detail: { type: 'bulk-import' } 
                }));
                
                // [FIX] Update UI to show decryption phase and WAIT for sidebar decryption
                setSyncState(prev => ({ ...prev, status: 'Decrypting your messages...' }));
                
                // [FIX] Fetch rooms to know which need decryption
                const freshRooms = await fetchRooms();
                
                // [FIX] Dispatch keys-updated event to trigger sidebar re-decryption
                window.dispatchEvent(new CustomEvent('cipher:keys-updated', { 
                    detail: { type: 'bulk-import' } 
                }));

                // [NEW] Wait for ALL rooms to actually finish decrypting (real-time)
                await waitForAllDecryptions(freshRooms || rooms);

                // [FIX] Enable backup prompt so user sets up auto-backup on this new device
                setSyncState({ active: false, status: 'Success!', showBackupPrompt: true, mode: 'approve' });
                // Trigger animation on next chat open
                setJustRestored(true);
                showNotification('Chat history synced successfully!', 'success');
                
                // 4. Notify other devices to clear popups ONLY after decryption is done
                newSocket.emit('sync_finished');
            } catch (e) {
                console.error('[Sync] Decryption failed', e);
                setSyncState(prev => ({ ...prev, active: false, status: 'Sync failed.' }));
            }
        });

        // [NEW] Handle when requester cancels sync (Provider Side)
        newSocket.on('sync_canceled', () => {
             console.log('[Sync] Requester canceled sync. Closing modal.');
             setPendingSyncRequest(null);
        });

        newSocket.on('sync_denied', () => {
            console.log('[Sync] Request denied by other device. Switching to password mode.');
            setSyncState(prev => ({ ...prev, mode: 'password', status: 'Request denied. Use backup password.' }));
        });

        // [NEW] Handle online device count from server
        newSocket.on('sync:target_count', ({ count }) => {
            console.log(`[Sync] Server found ${count} other online devices.`);
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

            if (count === 0) {
                 // No one online? Trigger the 5s fallback to password mode
                 syncTimeoutRef.current = setTimeout(() => {
                     setSyncState(prev => {
                         // ONLY switch if we are still active and in approve mode
                         if (prev.active && prev.mode === 'approve') {
                             console.log('[Sync] No devices found after timeout. Switching to password mode.');
                             return { ...prev, mode: 'password', status: '' };
                         }
                         return prev;
                     });
                 }, 5000);
            } else {
                // Online devices found! DO NOT auto-switch to password.
                setSyncState(prev => ({ ...prev, status: 'Waiting for approval from your other devices...' }));
            }
        });

        newSocket.on('sync_finished', () => {
            console.log('[Sync] Cleanup: Sync finished on another device.');
            // [FIX] Use ref instead of state to correctly check for active request (avoid stale closure)
            if (pendingSyncRequestRef.current) {
                 showNotification('Sync completed successfully!', 'success');
            }
            setPendingSyncRequest(null);
        });

        // [NEW] Global Typing Indicators
        newSocket.on('typing:start', ({ room_id, user_id, user_name }) => {
            const key = `${room_id}:${user_id}`;
            if (globalTypingTimeoutsRef.current[key]) {
                clearTimeout(globalTypingTimeoutsRef.current[key]);
            }

            setTypingByRoom(prev => {
                const roomTyping = prev[room_id] || [];
                if (roomTyping.some(u => String(u.userId) === String(user_id))) return prev;
                return {
                    ...prev,
                    [room_id]: [...roomTyping, { userId: user_id, name: user_name }]
                };
            });

            globalTypingTimeoutsRef.current[key] = setTimeout(() => {
                setTypingByRoom(prev => {
                    const roomTyping = prev[room_id] || [];
                    const filtered = roomTyping.filter(u => String(u.userId) !== String(user_id));
                    if (filtered.length === 0) {
                        const next = { ...prev };
                        delete next[room_id];
                        return next;
                    }
                    return { ...prev, [room_id]: filtered };
                });
                delete globalTypingTimeoutsRef.current[key];
            }, 4000);
        });

        newSocket.on('typing:stop', ({ room_id, user_id }) => {
            const key = `${room_id}:${user_id}`;
            if (globalTypingTimeoutsRef.current[key]) {
                clearTimeout(globalTypingTimeoutsRef.current[key]);
                delete globalTypingTimeoutsRef.current[key];
            }
            setTypingByRoom(prev => {
                const roomTyping = prev[room_id] || [];
                const filtered = roomTyping.filter(u => String(u.userId) !== String(user_id));
                if (filtered.length === 0) {
                    const next = { ...prev };
                    delete next[room_id];
                    return next;
                }
                return { ...prev, [room_id]: filtered };
            });
        });

        setSocket(newSocket);

        return () => {
            window.removeEventListener('online', processOfflineQueue);
            newSocket.close();
        };
    }, [token]);

    // Join rooms when they are loaded or socket connects
    const joinedRoomIds = useRef(new Set());
    useEffect(() => {
        if (socket && rooms.length > 0) {
            const newRooms = rooms.filter(r => !joinedRoomIds.current.has(r.id));
            if (newRooms.length === 0) return;

            newRooms.forEach(room => {
                socket.emit('join_room', room.id);
                joinedRoomIds.current.add(room.id);
            });
            
            // [NEW] Pre-fetch keys only for NEW rooms (Background)
            cryptoManager.prefetchKeys(newRooms);
        }
    }, [socket, rooms]);

    // Consolidated Data Fetching
    useEffect(() => {
        if (!token) return;


        fetchRooms();
    }, [token, fetchRooms]);

    // [NEW] Dedicated Effect for Handling Invites/URL Params
    useEffect(() => {
        if (!token || isLoadingRooms) return;

        const handlePendingInvite = async () => {
             const joinCode = searchParams.get('joinCode');
             const chatUser = searchParams.get('chatUser');
 
             if (!joinCode && !chatUser) return;
             if (isProcessingInviteRef.current) return;
             isProcessingInviteRef.current = true;

             // [FIX] Use setSearchParams for cleaner React Router sync
             setSearchParams({});

             if (joinCode) {
                 await handleJoinRoom(joinCode);
                 isProcessingInviteRef.current = false;
                 return;
             }
 
             if (chatUser) {
                 try {
                     const existingRoom = rooms.find(r => 
                         r.type === 'direct' && 
                         (r.username === chatUser || r.username === `@${chatUser}`)
                     );

                     if (existingRoom) {
                         handleSelectRoom(existingRoom);
                         isProcessingInviteRef.current = false;
                         return;
                     }

                     const searchRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/search?q=${chatUser}`, {
                         headers: { Authorization: `Bearer ${token}` }
                     });
                     const users = await searchRes.json();
                     const target = users.find(u => u.username === chatUser);
                     if (target) {
                         const existingById = rooms.find(r => r.type === 'direct' && String(r.other_user_id) === String(target.id));
                         if (existingById) {
                             handleSelectRoom(existingById);
                         } else {
                             await handleCreateRoom({ type: 'direct', targetUserId: target.id });
                         }
                     }
                 } catch (err) {
                     console.error('Error resolving invite:', err);
                 } finally {
                     isProcessingInviteRef.current = false;
                 }
                 return;
             }
        };

        handlePendingInvite();
    }, [token, isLoadingRooms, location.search, rooms.length]);

    // Re-implement handlePendingInvite since we cut it in the diff?
    // Wait, the original block lines 297-355 was large. 
    // I need to be careful not to lose handlePendingInvite logic.
    // Let me rewrite the whole block effectively.

    const markAsRead = async (roomId) => {
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/read`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state
            setRooms(prev => prev.map(r => 
                String(r.id) === String(roomId) ? { ...r, unread_count: 0, mention_count: 0 } : r
            ));
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (activeRoom) {
            markAsRead(activeRoom.id);
        }
    }, [activeRoom]);


    // [NEW] Handle Room Selection with Pre-fetching & Caching
    const handleSelectRoom = async (room) => {
        if (activeRoom?.id === room.id) return; // Already valid
        
        const loadingChatId = room.id; // Capture for closure - prevents race conditions
        setLoadingRoomId(room.id);
        
        // 1. Try to load from Cache first for instant open
        const cached = localStorage.getItem(`chat_messages_${room.id}`);
        let roomWithCache = { ...room };
        
        if (cached) {
            try {
                const parsedMessages = JSON.parse(cached);
                let hydrationBase = parsedMessages;

                // [OPTIMIZATION] If cache is missing the very latest message (known from sidebar), append it optimistically
                // This prevents the "flash of old history" effect where the message you just clicked is missing for 200ms
                if (room.last_message_id && !parsedMessages.find(m => String(m.id) === String(room.last_message_id))) {
                    const syntheticMessage = {
                         id: room.last_message_id,
                         room_id: String(room.id),
                         // [FIX] Ensure user_id is populated for alignment
                         user_id: room.last_message_sender_id, // This is critical for isMe check!
                         content: room.last_message_content,
                         type: room.last_message_type || 'text',
                         status: room.last_message_status || 'sent', // Initially take from room
                         created_at: room.last_message_at || new Date().toISOString(),
                         caption: room.last_message_caption,
                         file_name: room.last_message_file_name,
                         is_view_once: room.last_message_is_view_once,
                         viewed_by: room.last_message_viewed_by || [],
                         // Use display_name from room metadata or fallback
                         display_name: room.last_message_sender_name || 'User',
                         username: room.last_message_sender_name || 'User', // Fallback
                         is_pinned: false,
                         reactions: [],
                         // Attachments (if available in future metadata, for now empty or standard)
                         attachments: room.last_message_attachments || [], 
                         poll: room.last_message_poll_question ? { question: room.last_message_poll_question } : null,
                         
                         // [NEW] Map rich metadata
                         audio_url: room.last_message_audio_url,
                         audio_duration_ms: room.last_message_audio_duration_ms,
                         audio_waveform: room.last_message_audio_waveform,
                         image_url: room.last_message_image_url,
                         file_url: room.last_message_file_url,
                         gif_url: room.last_message_gif_url,
                         preview_url: room.last_message_preview_url,

                         // [NEW] E2EE Fields for decryption
                         ciphertext: room.last_message_ciphertext,
                         iv: room.last_message_iv,
                         key_version: room.last_message_key_version,
                         sender_device_id: room.last_message_sender_device_id
                    };
                    hydrationBase = [...parsedMessages, syntheticMessage];
                }

                roomWithCache.initialMessages = normalizeReplies(hydrationBase, []);
            } catch (e) {
                console.error("Cache parse error", e);
            }
        }
        
        // Switch immediately
        setActiveRoom(roomWithCache);

        try {
            // 2. Fetch fresh messages (limit 50)
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages?limit=50`, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (res.ok) {
                const data = await res.json();
                // Ensure room_id is present and String for IndexedDB query alignment
                const normalizedData = data.map(m => ({ ...m, room_id: String(room.id) }));
                const hydrated = normalizeReplies(normalizedData, []);
                
                // [CRITICAL] Guard against stale API responses during rapid switching
                if (String(loadingChatId) !== String(activeRoomRef.current?.id)) {
                    console.log('[Guard] Ignoring stale API response for room', loadingChatId);
                    return;
                }
                
                // Update Cache
                localStorage.setItem(`chat_messages_${room.id}`, JSON.stringify(hydrated));
                
                // Update State
                setActiveRoom(prev => {
                    // Only update if user hasn't switched rooms again
                    if (prev && String(prev.id) === String(room.id)) {
                        return { ...prev, initialMessages: hydrated };
                    }
                    return prev;
                });
            } else {
                console.error("Failed to fetch messages");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingRoomId(null);
        }
    };

    const handleCreateRoom = async (roomData) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify(roomData)
            });
            if (res.ok) {
                const newRoom = await res.json();
                
                // [FIX] Use functional state update to prevent duplicates and race conditions
                setRooms(prev => {
                    const exists = prev.find(r => String(r.id) === String(newRoom.id));
                    if (exists) {
                        // Preserve existing room data (like plaintext preview) if it's already there
                        return prev;
                    }
                    return sortRooms([newRoom, ...prev]);
                });
                
                setShowCreateModal(false);
                await handleSelectRoom(newRoom);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleMessageUser = useCallback(async (userId) => {
        handleCloseProfile();
        // Find existing DM with this user
        const existingDm = rooms.find(r => r.type === 'direct' && String(r.other_user_id) === String(userId));
        if (existingDm) {
            handleSelectRoom(existingDm);
        } else {
            // Create new DM
            await handleCreateRoom({ type: 'direct', targetUserId: userId });
        }
    }, [rooms, handleSelectRoom, handleCloseProfile]);

    const handleJoinRoom = async (code) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/join`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ code })
            });
            const newRoom = await res.json();
            if (res.ok) {
                // Check if already in list
                if (!rooms.find(r => String(r.id) === String(newRoom.id))) {
                    setRooms(prev => sortRooms([newRoom, ...prev]));
                }
                setShowJoinModal(false);
                
                // Fetch messages immediately so the user sees the "You joined" message
                await handleSelectRoom(newRoom);
            } else {
                alert(newRoom.error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // [NEW] Handle Go To Message (Global)
    const handleGoToMessage = async (roomId, messageId) => {
        setShowGroupInfo(false);

        // 1. Switch Room if needed
        if (activeRoomRef.current?.id !== roomId) {
            const targetRoom = rooms.find(r => r.id === roomId);
            if (targetRoom) {
               await handleSelectRoom(targetRoom);
               // Small delay to ensure render/message list mount handles the highlight
               // though React state updates are batched, the new component needs to mount.
               // handleSelectRoom awaits fetch, so it should be ready-ish.
            } else {
                console.warn(`Room ${roomId} not found in sidebar list.`);
                // Maybe fetch single room? For now assume it's in the list.
                return;
            }
        }

        // 2. Highlight Message
        setHighlightMessageId(messageId);
        setTimeout(() => setHighlightMessageId(null), 2000); 
    };

    // [NEW] Optimistic Room Update (for Offline/Sending state)
    const handleMessageSent = (roomId, message) => {
        setRooms(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => String(r.id) === String(roomId));
            if (idx > -1) {
                const room = { ...updated[idx] };
                
                // Update last message content for sidebar preview
                let previewContent = message.content;
                if (message.type === 'image') previewContent = 'Sent an image';
                else if (message.type === 'file') previewContent = message.file_name || 'Sent a file';
                else if (message.type === 'audio') previewContent = 'Voice message';
                else if (message.type === 'gif') previewContent = 'GIF';
                else if (message.type === 'location') previewContent = 'Location';
                else if (message.type === 'poll') previewContent = 'Poll';
                else if (!previewContent) previewContent = 'Sent a message';
                
                room.last_message_content = previewContent;
                room.last_message_ciphertext = null; 
                room.last_message_type = message.type || 'text';
                room.last_message_sender_id = user.id;
                room.last_message_status = 'sending'; 
                room.last_message_at = new Date().toISOString(); 
                room.last_message_created_at = message.created_at || new Date().toISOString(); // [FIX] Set created_at for reaction comparison
                room.last_message_id = message.tempId || message.id;
                room.last_message_file_name = message.file_name || null; // [FIX] Include file name
                
                // [FIX] Clear latest_reaction so new message shows instead of old reaction
                room.latest_reaction = null;
                // [FIX] Clear last_message_reactions since new message has no reactions yet
                room.last_message_reactions = [];
                
                updated[idx] = room;
                return sortRooms(updated);
            }
            return prev;
        });
    };

    // [NEW] Update Status after ACK (Sending -> Sent)
    // [NEW] Update Status after ACK (Sending -> Sent)
    const handleMessageStatusUpdate = (roomId, tempId, newStatus, newId) => {
         setRooms(prev => {
             const updated = [...prev];
             const idx = updated.findIndex(r => String(r.id) === String(roomId));
             if (idx > -1) {
                 const room = { ...updated[idx] };
                 // Check against both tempId and newId
                 if (String(room.last_message_id) === String(tempId) || (newId && String(room.last_message_id) === String(newId))) {
                     // [FIX] Priority Check to prevent downgrade
                     const priority = { 'sending': 0, 'sent': 1, 'delivered': 2, 'seen': 3 };
                     const currentP = priority[room.last_message_status] || 0;
                     const newP = priority[newStatus] || 0;
                     
                     if (newP >= currentP) {
                        room.last_message_status = newStatus;
                     }
                     if (newId) room.last_message_id = newId; 
                 }
                 updated[idx] = room;
                 return updated;
             }
             return prev;
         });
    };

    // [NEW] Optimistic Reaction Update for Sidebar
    const handleOptimisticReaction = (roomId, message, reaction) => {
        setRooms(prev => {
            const idx = prev.findIndex(r => String(r.id) === String(roomId));
            if (idx === -1) return prev;

            const room = { ...prev[idx] };
            const isLastMessage = String(room.last_message_id) === String(message.id);

            // Compute new reactions for this message
            let currentReactions = isLastMessage ? (room.last_message_reactions || []) : (message.reactions || []);
            if (typeof currentReactions === 'string') {
                try { currentReactions = JSON.parse(currentReactions); } catch { currentReactions = []; }
            }

            let nextReactions;
            const targetUserId = String(user.id);
            const filterUserId = (r) => {
                const rId = String(r.userId || r.user_id || r.reactor_id || '');
                return rId !== targetUserId;
            };

            if (reaction) {
                // Add/Update
                const others = currentReactions.filter(filterUserId);
                nextReactions = [{
                    userId: user.id,
                    reaction,
                    username: user.username,
                    display_name: user.display_name,
                    avatar_thumb_url: user.avatar_thumb_url,
                    created_at: new Date().toISOString()
                }, ...others];
            } else {
                // Remove
                nextReactions = currentReactions.filter(filterUserId);
            }

            // [FIX] Update official_last_message reactions if it matches the current message
            if (room.official_last_message && String(room.official_last_message.id) === String(message.id)) {
                let offReactions = room.official_last_message.reactions || [];
                if (typeof offReactions === 'string') {
                    try { offReactions = JSON.parse(offReactions); } catch { offReactions = []; }
                }

                if (reaction) {
                    const others = offReactions.filter(filterUserId);
                    room.official_last_message.reactions = [{
                        userId: user.id,
                        reaction,
                        username: user.username,
                        display_name: user.display_name,
                        avatar_thumb_url: user.avatar_thumb_url,
                        created_at: new Date().toISOString()
                    }, ...others];
                } else {
                    room.official_last_message.reactions = offReactions.filter(filterUserId);
                }
            }

            // Update room state
            if (isLastMessage) {
                if (reaction) {
                    room.last_message_reactions = nextReactions;
                    if (room.official_last_message && String(room.official_last_message.id) === String(message.id)) {
                        room.official_last_message.reactions = nextReactions;
                    }
                } else {
                    // Unreacting from current preview. Revert if promoted.
                    const officialLatest = room.official_last_message;
                    if (officialLatest && String(officialLatest.id) !== String(message.id)) {
                        const off = { ...officialLatest };
                        
                        // [SCORCHED EARTH] Ensure our reaction is gone from official before reverting
                        let offReactions = off.reactions || [];
                        if (typeof offReactions === 'string') {
                            try { offReactions = JSON.parse(offReactions); } catch { offReactions = []; }
                        }
                        off.reactions = offReactions.filter(filterUserId);

                        room.last_message_id = off.id;
                        room.last_message_content = off.content;
                        room.last_message_type = off.type;
                        room.last_message_ciphertext = off.ciphertext;
                        room.last_message_iv = off.iv;
                        room.last_message_salt = off.salt;
                        room.last_message_key_version = off.key_version;
                        room.last_message_temp_id = off.temp_id;
                        room.last_message_reactions = off.reactions;
                        room.last_message_at = off.created_at;
                        room.last_message_sender_id = off.user_id;
                        room.last_message_sender_name = off.sender_name;
                        room.last_message_status = off.status;
                        room.last_message_caption = off.caption;
                        room.last_message_file_name = off.file_name;
                        room.last_message_is_view_once = off.is_view_once;
                        room.last_message_viewed_by = off.viewed_by;
                        room.last_message_attachments_count = Array.isArray(off.attachments) ? off.attachments.length : 0;
                        room.last_message_poll_question = off.poll_question;
                        
                        room.official_last_message = off;
                    } else {
                        // Official latest itself, apply filter
                        room.last_message_reactions = nextReactions;
                        if (room.official_last_message && String(room.official_last_message.id) === String(message.id)) {
                            room.official_last_message.reactions = nextReactions;
                        }
                    }
                }
            } else if (reaction) {
                // Promote old message
                room.last_message_id = message.id;
                room.last_message_content = message.content;
                room.last_message_type = message.type || 'text';
                room.last_message_ciphertext = message.ciphertext;
                room.last_message_iv = message.iv;
                room.last_message_salt = message.salt;
                room.last_message_key_version = message.key_version;
                room.last_message_temp_id = message.temp_id;
                room.last_message_reactions = nextReactions;
                room.last_message_at = new Date().toISOString();
                room.last_message_sender_id = message.user_id;
                room.last_message_sender_name = message.display_name || message.username;
            }
            
            // [FIX] Set latest_reaction for proper sidebar notification display
            if (reaction) {
                room.latest_reaction = {
                    emoji: reaction,
                    message_id: message.id,
                    user_id: user.id,
                    display_name: user.display_name || user.username,
                    timestamp: new Date().toISOString(),
                    message_content: message.content,
                    message_type: message.type || 'text',
                    message_file_name: message.file_name,
                    message_ciphertext: message.ciphertext,
                    message_iv: message.iv,
                    message_key_version: message.key_version,
                    message_temp_id: message.temp_id
                };
            } else {
                // Clear latest_reaction when unreacting (if it's for the same message)
                if (room.latest_reaction && String(room.latest_reaction.message_id) === String(message.id)) {
                    room.latest_reaction = null;
                }
            }
            
            if (!reaction) {
                // Unreact on old message that isn't the preview: do nothing to sidebar
                const updated = [...prev];
                updated[idx] = room;
                return updated;
            }

            // [NEW] Update Active Room state to prevent re-hydration with stale data
            setActiveRoom(prev => {
                if (prev && String(prev.id) === String(roomId)) {
                    const updatedRoom = { ...prev };
                    
                    // 1. Update initialMessages to include this reaction
                    if (updatedRoom.initialMessages) {
                        updatedRoom.initialMessages = updatedRoom.initialMessages.map(m => {
                            if (String(m.id) === String(message.id)) {
                                return { ...m, reactions: nextReactions };
                            }
                            return m;
                        });
                    }

                    // 2. Update official_last_message if it matches
                    if (updatedRoom.official_last_message && String(updatedRoom.official_last_message.id) === String(message.id)) {
                        updatedRoom.official_last_message = {
                            ...updatedRoom.official_last_message,
                            reactions: nextReactions
                        };
                    }

                    // [NEW] Sync localStorage cache
                    const cacheKey = `chat_messages_${roomId}`;
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        try {
                            const messages = JSON.parse(cached);
                            const updatedCache = messages.map(m => {
                                if (String(m.id) === String(message.id)) {
                                    return { ...m, reactions: nextReactions };
                                }
                                return m;
                            });
                            localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
                        } catch (e) {
                            console.error("Failed to sync localStorage reactions", e);
                        }
                    }

                    return updatedRoom;
                }
                return prev;
            });

            const updated = [...prev];
            updated[idx] = room;
            
            // [NEW] Only bump to top (sort) if there is a reaction (new activity)
            if (reaction) {
                room.last_message_at = new Date().toISOString();
                return sortRooms(updated);
            } else {
                return updated; // Stay in same position (roughly)
            }
        });
    };

    return (
        <PresenceProvider socket={socket}>
            <AiChatProvider socket={socket}>
                <CallProvider socket={socket}>
        {/* Notification Permission Banner */}
        {!syncState.active && <NotificationPermissionBanner />}
        
        <div className={`fixed inset-0 h-[100dvh] w-full bg-gray-50 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden flex border border-slate-200 dark:border-slate-800 ${isResizing ? 'select-none cursor-col-resize' : ''} animate-dashboard-entry transition-colors`}>
            {/* [NEW] SideNav - Desktop only icon filter bar */}
            <SideNav 
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                unreadCounts={unreadCounts}
                onLogout={() => setShowLogoutModal(true)}
            />
            
            {/* Mobile: Sidebar hidden if activeRoom exists OR pending unlock. Desktop: Always visible */}
            <div 
                className={`
                    ${(activeRoom || pendingUnlockRoom) ? 'hidden md:flex' : 'flex'} 
                    h-full z-10 shrink-0
                    w-full md:w-[var(--sidebar-width)]
                `}
                style={{ '--sidebar-width': `${sidebarWidth}px` }}
            >
                <Sidebar 
                    rooms={rooms} 
                    activeRoom={activeRoom} 
                    onSelectRoom={handleSelectRoom} 
                    loadingRoomId={loadingRoomId}   
                    isLoading={isLoadingRooms}      
                    onCreateRoom={() => setShowCreateModal(true)}
                    onJoinRoom={() => setShowJoinModal(true)}
                    user={user}
                    onRefresh={fetchRooms}           
                    hasSkippedSync={hasSkippedSync}
                    onLogout={() => setShowLogoutModal(true)}
                    onGoToMessage={handleGoToMessage}
                    typingByRoom={typingByRoom}
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                    onRoomLocked={(roomId) => {
                        // Close the chat if the locked room is currently active
                        if (activeRoom && String(activeRoom.id) === String(roomId)) {
                            setActiveRoom(null);
                        }
                    }}
                    onShowProfile={() => handleOpenProfile(user.id, null, hasSkippedSync)}
                />
            </div>

            {/* Drag Handle (Desktop Only) */}
            {!showGroupInfo && (
                <div 
                    className="hidden md:block w-1 hover:w-1.5 cursor-col-resize bg-slate-200 dark:bg-slate-800 hover:bg-violet-500 transition-all z-10 shrink-0"
                    onMouseDown={startResizing}
                />
            )}
            
            {/* Mobile: Chat visible if activeRoom exists. Desktop: Always visible (flex-1) */}
            <ChatAreaLockGuard onUnlockComplete={handleSelectRoom}>
            <div className={`
                ${(activeRoom || pendingUnlockRoom) ? 'flex' : 'hidden md:flex'} 
                flex-1 flex-col h-full bg-gray-50 dark:bg-slate-950 relative z-0 min-w-0 overflow-hidden transition-colors duration-300
            `}>
                {activeRoom ? (
                    activeRoom.type === 'ai' ? (
                        <AIChatWindow
                            key={activeRoom.id}
                            socket={socket}
                            room={activeRoom}
                            user={user}
                            isLoading={loadingRoomId === activeRoom.id && !activeRoom.initialMessages}
                            onBack={() => setActiveRoom(null)}
                        />
                    ) : (
                        <ChatWindow 
                            key={activeRoom.id} // [NEW] Force re-mount for new room
                            socket={socket} 
                            room={activeRoom} // contains initialMessages now
                            user={user} 
                            isLoading={loadingRoomId === activeRoom.id && !activeRoom.initialMessages}
                            typingByRoom={typingByRoom} // [NEW]
                            onBack={() => setActiveRoom(null)}
                            showGroupInfo={showGroupInfo}
                            setShowGroupInfo={setShowGroupInfo}
                            historyHiddenAt={historyHiddenAt} // [NEW]
                            highlightMessageId={highlightMessageId} // [NEW]
                            onGoToMessage={(msgId) => handleGoToMessage(activeRoom.id, msgId)} // [FIXED] Pass correct signature for local room usage
                            onRefresh={fetchRooms} 
                            onMessageSent={handleMessageSent} 
                            onMessageStatusUpdate={handleMessageStatusUpdate}
                            onOptimisticReaction={handleOptimisticReaction}
                            justRestored={justRestored} // [NEW]
                            hasSkippedSync={hasSkippedSync} // [NEW]
                            onRestoreAnimationComplete={() => {
                                setJustRestored(false);
                                setShowRestoreModal(false); // [NEW] Close modal after animation
                            }} // [NEW]
                            onOpenMainProfile={() => handleOpenProfile(user.id, null, true)} // [NEW] Always show Restore in main profile
                            onOpenProfile={handleOpenProfile} // [NEW] Centralized profile opener
                        />
                    )
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-slate-950 relative overflow-hidden">
                        {/* Background Ambient Effects */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse-slow mix-blend-multiply dark:mix-blend-screen" />
                            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow mix-blend-multiply dark:mix-blend-screen" style={{ animationDelay: '1s' }} />
                        </div>

                        <div className="relative z-10 text-center p-8 max-w-lg animate-fade-in-up">
                            {/* Animated Illustration */}
                            <div className="mb-8 relative inline-block group cursor-default">
                                <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full scale-0 group-hover:scale-110 transition-transform duration-500" />
                                <div className="relative w-32 h-32 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex items-center justify-center border border-slate-200 dark:border-slate-800 transform rotate-3 group-hover:rotate-6 transition-transform duration-500">
                                    <div className="absolute inset-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl" />
                                    <div className="flex gap-1 animate-bounce-slight">
                                        <div className="w-2 h-2 rounded-full bg-violet-500" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-indigo-500" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-sky-500" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500 absolute bottom-6 right-6 transform -rotate-12 group-hover:rotate-0 transition-transform">
                                        send
                                    </span>
                                </div>
                                {/* Floating Elements */}
                                <div className="absolute -top-4 -right-4 bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 animate-float" style={{ animationDelay: '0.5s' }}>
                                    <span className="material-symbols-outlined text-green-500 text-lg">lock</span>
                                </div>
                                <div className="absolute -bottom-2 -left-6 bg-white dark:bg-slate-800 px-3 py-1 rounded-full shadow-lg border border-slate-100 dark:border-slate-700 animate-float" style={{ animationDelay: '1.5s' }}>
                                    <span className="text-xs font-mono text-slate-500">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1" />
                                        Online
                                    </span>
                                </div>
                            </div>

                            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-violet-800 to-slate-900 dark:from-white dark:via-violet-200 dark:to-white mb-3">
                                Welcome, {renderTextWithEmojis(user?.display_name || 'Guest', '1.1em')}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-lg mb-8 leading-relaxed">
                                Select a conversation from the sidebar or start a new room to begin secure messaging.
                            </p>

                            <div className="flex flex-wrap justify-center gap-4">
                                <button 
                                    onClick={() => setShowCreateModal(true)}
                                    className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all transform hover:-translate-y-0.5 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-xl">add</span>
                                    New Room
                                </button>
                                <button 
                                    onClick={() => setShowJoinModal(true)}
                                    className="px-6 py-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium border border-slate-200 dark:border-slate-700 shadow-sm transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-xl">login</span>
                                    Join Room
                                </button>
                            </div>
                        </div>
                        
                        <div className="absolute bottom-8 left-0 w-full text-center">
                            <p className="text-xs text-slate-400 dark:text-slate-600 font-mono flex items-center justify-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                                <span className="material-symbols-outlined text-sm">encrypted</span>
                                End-to-end encrypted • Zero logs
                            </p>
                        </div>
                    </div>
                )}
            </div>
            </ChatAreaLockGuard>

            {showCreateModal && (
                <CreateRoomModal 
                    onClose={() => setShowCreateModal(false)} 
                    onCreate={handleCreateRoom} 
                />
            )}

            {showJoinModal && (
                <JoinRoomModal 
                    onClose={() => setShowJoinModal(false)} 
                    onJoin={handleJoinRoom} 
                />
            )}

            <LogoutModal 
                isOpen={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                onConfirm={() => {
                    setShowLogoutModal(false);
                    logout();
                }}
            />

            {showGroupInfo && activeRoom && (
                <GroupInfoModal 
                    room={activeRoom} 
                    socket={socket}
                    onClose={() => setShowGroupInfo(false)}
                    hasMessages={activeRoom.initialMessages && activeRoom.initialMessages.length > 0}
                    onGoToMessage={(msgId) => handleGoToMessage(activeRoom.id, msgId)} // [FIXED]
                    onLeave={async () => {
                         try {
                             await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${activeRoom.id}/leave`, {
                                 method: 'POST',
                                 headers: { Authorization: `Bearer ${token}` }
                             });
                             window.location.reload(); 
                         } catch (err) {
                             console.error(err);
                         }
                    }}
                    // Kick would be handled within modal or via props if needed, but GroupInfoModal handles it internally mostly or via context
                />
            )}

            {/* [PHASE 1 & 2] Key Sync & Restore UI (Global) */}
            {syncState.active && (
                <div className="fixed inset-0 z-[1000] bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
                <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        
                        {/* Tabs */}
                        <div className="flex p-2 bg-slate-100 dark:bg-slate-950/50">
                            <button 
                                onClick={() => {
                                    setSyncState(prev => ({ ...prev, mode: 'approve' }));
                                    triggerSync();
                                }}
                                className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${syncState.mode === 'approve' ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg">devices</span>
                                    Wait for Approval
                                </span>
                            </button>
                            <button 
                                onClick={() => setSyncState(prev => ({ ...prev, mode: 'password' }))}
                                className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${syncState.mode === 'password' ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg">lock</span>
                                    Backup Password
                                </span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-8 text-center min-h-[350px] flex flex-col justify-center">
                            {syncState.mode === 'approve' ? (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="relative mb-6 mx-auto w-24 h-24">
                                        <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-800 rounded-full"></div>
                                        <div className="absolute inset-0 border-t-4 border-violet-500 rounded-full animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-violet-500 text-3xl animate-pulse">sync</span>
                                        </div>
                                    </div>
                                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Syncing History</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs mx-auto mb-8">
                                        {syncState.status || "Waiting for your other device to approve this login..."}
                                    </p>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-100 dark:border-violet-900/30">
                                            <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
                                                Tip: Check your phone or another computer where you're already logged in.
                                            </p>
                                        </div>
                                        <button 
                                            onClick={handleSkipSync} // [UPDATED] Use dedicated handler
                                            className="w-full py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                        >
                                            Cancel & No History
                                        </button>
                                    </div>
                                </div>
                            ) : isRestoring ? (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center py-4">
                                        <div className="relative mb-6 mx-auto w-24 h-24">
                                            <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-800 rounded-full"></div>
                                            <div className="absolute inset-0 border-t-4 border-violet-500 rounded-full animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-violet-500 text-3xl animate-pulse">cloud_download</span>
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Restoring History</h3>
                                        <p className="text-violet-600 dark:text-violet-400 text-sm font-medium animate-pulse mb-4">
                                            {syncState.status || 'Processing...'}
                                        </p>
                                        <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-100 dark:border-violet-900/30 max-w-xs">
                                            <p className="text-xs text-violet-600 dark:text-violet-400 text-center">
                                                Please wait while we decrypt your chat history. This may take a moment.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); handleManualRestore(e); }} className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-stretch">
                                        <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                            <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-3xl">key</span>
                                        </div>
                                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">History Password</h3>
                                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
                                            Enter your global backup password to decrypt your history from the cloud.
                                        </p>
                                        
                                        <div className="text-left space-y-4">
                                        <div className="relative">
                                            <input 
                                                type={showPassword ? "text" : "password"}
                                                value={restorePassword}
                                                onChange={(e) => setRestorePassword(e.target.value)}
                                                placeholder="Enter backup password"
                                                className="w-full px-5 py-4 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all pr-12"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setShowPassword(!showPassword); }}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-xl">
                                                    {showPassword ? 'visibility_off' : 'visibility'}
                                                </span>
                                            </button>
                                        </div>
                                            
                                            {restoreError && (
                                                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400 text-sm font-medium">
                                                    <span className="material-symbols-outlined text-lg">error</span>
                                                    {restoreError}
                                                </div>
                                            )}
                                            
                                            <button 
                                                type="submit"
                                                disabled={!restorePassword}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-full py-4 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                                            >
                                                <span className="material-symbols-outlined">cloud_download</span>
                                                Decrypt History
                                            </button>
                                        </div>
                                    </form>
                                )}
                        </div>
                    </div>
                </div>
            )}



            {/* [NEW] Centralized Profile Panel */}
            {profileState.isOpen && (
                <ProfilePanel 
                    userId={profileState.userId}
                    isOpen={profileState.isOpen}
                    roomId={profileState.roomId}
                    onClose={handleCloseProfile}
                    onActionSuccess={(action) => {
                        if (action === 'backup_created') {
                            localStorage.removeItem('skipped_sync');
                            setHasSkippedSync(false);
                        }
                        if (action === 'delete') {
                            const roomIdToDelete = profileState.roomId || (activeRoom && activeRoom.id);
                            if (roomIdToDelete) {
                                setRooms(prev => prev.filter(r => String(r.id) !== String(roomIdToDelete)));
                                if (activeRoom && String(activeRoom.id) === String(roomIdToDelete)) {
                                    setActiveRoom(null);
                                }
                            }
                        }
                        if (action === 'block' || action === 'unblock') {
                            const isBlocked = action === 'block'; 
                            // 1. Update Active Room (for ChatWindow)
                            if (activeRoom && (String(activeRoom.id) === String(profileState.roomId))) {
                                setActiveRoom(prev => ({ 
                                    ...prev, 
                                    is_blocked_by_me: isBlocked 
                                }));
                            }
                             // 2. Update Rooms List
                            setRooms(prev => prev.map(r => 
                                String(r.id) === String(profileState.roomId) 
                                    ? { ...r, is_blocked_by_me: isBlocked } 
                                    : r
                            ));
                        }
                        if (action === 'clear') {
                            // Immediately clear last message in sidebar for this room
                            const roomIdToClear = profileState.roomId || activeRoom?.id;
                            if (roomIdToClear) {
                                setRooms(prev => prev.map(r => 
                                    String(r.id) === String(roomIdToClear) 
                                        ? { 
                                            ...r, 
                                            last_message_id: null,
                                            last_message_content: null,
                                            last_message_type: null,
                                            last_message_status: null,
                                            last_message_sender_id: null,
                                            last_message_created_at: null,
                                            last_message_plaintext: null,
                                            last_message_ciphertext: null,
                                            last_message_iv: null,
                                            last_message_key_version: null,
                                            last_message_temp_id: null,
                                            last_message_reactions: null,
                                            latest_reaction: null,
                                            unread_count: 0,
                                            mention_count: 0,
                                            official_last_message: { id: null, content: null, type: null }
                                        } 
                                        : r
                                ));

                                // Update active room if matches
                                setActiveRoom(prev => {
                                    if (prev && String(prev.id) === String(roomIdToClear)) {
                                        return { 
                                            ...prev, 
                                            initialMessages: [], 
                                            last_message_id: null,
                                            last_message_content: null,
                                            last_message_plaintext: null
                                        };
                                    }
                                    return prev;
                                });
                            }
                        }
                        fetchRooms();
                    }}
                    onGoToMessage={(msgId) => {
                        handleCloseProfile();
                        handleGoToMessage(profileState.roomId, msgId);
                    }}
                    showRestoreOption={profileState.showRestoreOption}
                    hasSkippedSync={hasSkippedSync}
                    onRequestSync={() => {
                        handleCloseProfile();
                        setShowRestoreModal(true);
                    }}
                    socket={socket}
                    onMessageUser={handleMessageUser}
                />
            )}

            {/* [NEW] Sync Approval Modal (Global) */}
            {pendingSyncRequest && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setPendingSyncRequest(null)} />
                    <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-modal-scale">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-3xl">
                                    devices_other
                                </span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">New Device Detected</h3>
                            <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-2 px-3 py-1 bg-violet-50 dark:bg-violet-900/20 rounded-full inline-block">
                                {pendingSyncRequest.deviceInfo || 'Unknown Device'}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                                A new session is requesting to sync your encrypted chat history. 
                                <br />
                                <span className="text-[10px] opacity-70 mt-2 block font-mono">
                                    Device ID: {pendingSyncRequest.targetDeviceId.slice(0, 8)}...
                                </span>
                            </p>

                            {pendingSyncRequest.status === 'approving' ? (
                                <div className="py-8 animate-in fade-in duration-300">
                                    <div className="relative mb-6 mx-auto w-16 h-16">
                                        <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-800 rounded-full"></div>
                                        <div className="absolute inset-0 border-t-4 border-violet-500 rounded-full animate-spin"></div>
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-300 font-medium mb-2">Syncing history...</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        Please wait while the new device decrypts your messages.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <button 
                                        onClick={handleApproveSync}
                                        className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition-all shadow-lg shadow-violet-500/20"
                                    >
                                        Approve and Sync
                                    </button>
                                    <button 
                                        onClick={handleDenySyncRequest}
                                        className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all font-bold"
                                    >
                                        Deny Request
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        {/* [NEW] Profile-triggered Restore Modal */}
        <RestoreModal 
            isOpen={showRestoreModal}
            onClose={() => setShowRestoreModal(false)}
            onSkip={() => {
                // [FIX] Mark as skipped so restore option shows in profile settings
                localStorage.setItem('skipped_sync', 'true');
                const now = Date.now();
                localStorage.setItem('history_hidden_at', now.toString());
                setHasSkippedSync(true);
                setHistoryHiddenAt(now);
                showNotification('You can restore chat history later from Profile settings.', 'info');
            }}
            onRestoreSuccess={async () => {
                // NOTE: cipher:keys-updated event is already dispatched by CryptoManager.importKeysSync()
                // But at that point, messages aren't in IndexedDB yet. We dispatch again AFTER fetchRooms.
                
                // [FIX] Clear any pending sync request since user already restored via password
                setPendingSyncRequest(null);
                setSyncState({ active: false, status: '', showBackupPrompt: false, mode: 'approve' });
                
                // [FIX] Record timestamp to suppress spurious sync requests for 2 mins
                localStorage.setItem('last_restore_timestamp', Date.now().toString());
                
                // Fetch rooms to get fresh data (this also saves messages to IndexedDB)
                const freshRooms = await fetchRooms(true);
                
                // Wait a tick for React to re-render with new rooms AND for IndexedDB writes to complete
                await new Promise(r => setTimeout(r, 200));
                
                // [FIX] NOW dispatch keys-updated so ChatWindow can re-decrypt from IndexedDB
                // This must happen AFTER fetchRooms because ChatWindow reads from IndexedDB
                window.dispatchEvent(new CustomEvent('cipher:keys-updated', { 
                    detail: { type: 'bulk-import', source: 'dashboard-post-fetch' } 
                }));
                
                // Wait for ALL rooms to actually finish decrypting (real-time)
                await waitForAllDecryptions(freshRooms || rooms);
                
                localStorage.removeItem('skipped_sync');
                setHasSkippedSync(false);
                setJustRestored(true); // Trigger background animation
                
                // Close modal AFTER decryption is complete
                setShowRestoreModal(false);
                showNotification('Chat history restored!', 'success');
            }}
            token={token}
            onSwitchToSync={() => {
                setShowRestoreModal(false);
                triggerSync();
            }}
        />
        
        <CallModal />
        </CallProvider>
        </AiChatProvider>
        </PresenceProvider>
    );
}

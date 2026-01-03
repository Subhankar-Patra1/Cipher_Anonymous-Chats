import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import PickerPanel from './PickerPanel';
import ContentEditable from 'react-contenteditable';
import { linkifyText, textToHtml } from '../utils/linkify';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

import AvatarEditorModal from './AvatarEditorModal';
import GroupPermissionsView from './GroupPermissionsView';
import GroupParticipantsView from './GroupParticipantsView';
import SharedMedia from './SharedMedia'; // [NEW]
import ImageViewerModal from './ImageViewerModal';
import GroupOwnershipTransferView from './GroupOwnershipTransferView';

export default function GroupInfoModal({ room, onClose, onLeave, onKick, socket, onGoToMessage }) {
    const { token, user: currentUser } = useAuth();
    const [view, setView] = useState('main'); // 'main', 'permissions', 'participants'
    
    // Core Data
    const [permissions, setPermissions] = useState(room.permissions || {
        allow_name_change: true,
        allow_description_change: true,
        allow_add_members: true,
        send_mode: 'everyone'
    });
    const [members, setMembers] = useState([]);
    
    // Loading States
    const [loading, setLoading] = useState(true);
    
    // Edit States
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [nameLoading, setNameLoading] = useState(false);
    const [showNameEmoji, setShowNameEmoji] = useState(false);
    
    const [isEditingBio, setIsEditingBio] = useState(false);
    const [editedBio, setEditedBio] = useState('');
    const [bioLoading, setBioLoading] = useState(false);
    const [localBio, setLocalBio] = useState(room.bio);
    
    // Avatar States
    const [localAvatar, setLocalAvatar] = useState(room.avatar_url);
    const [localAvatarThumb, setLocalAvatarThumb] = useState(room.avatar_thumb_url);
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [fullScreenImage, setFullScreenImage] = useState(null);

    // Emoji Picker (for Bio)
    const [showEmoji, setShowEmoji] = useState(false);
    const editorRef = useRef(null);
    const lastRange = useRef(null);
    const nameInputRef = useRef(null);
    const nameRange = useRef(null);
    
    // UI Helpers
    const [copySuccess, setCopySuccess] = useState('');
    const [isTransferring, setIsTransferring] = useState(false);

    const handleTransferOwnership = async (newOwnerId) => {
        setIsTransferring(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/transfer-ownership`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ newOwnerId })
            });

            if (res.ok) {
                // Transfer successful, now leave (which triggers reload)
                onLeave();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to transfer ownership');
                setIsTransferring(false);
            }
        } catch (error) {
            console.error(error);
            setIsTransferring(false);
        }
    };

    const handleLeaveClick = () => {
        // If owner and has other members, require transfer
        if (isOwner && members.length > 1) {
            setView('transfer_ownership');
            return;
        }

        // Standard leave with confirm
        if (confirm('Are you sure you want to leave this group?')) {
            onLeave();
        }
    };

    useEffect(() => {
        if (room.id) {
            setLoading(true);
            Promise.all([fetchPermissions(), fetchMembers()]).finally(() => setLoading(false));
        }
    }, [room.id]);

    const saveNameSelection = () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            nameRange.current = selection.getRangeAt(0);
        }
    };

    const handleSaveName = async () => {
        // Strip HTML to get plain text
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = editedName;
        // Replace img tags with alt text (emoji)
        const images = tempDiv.getElementsByTagName('img');
        while (images.length > 0) {
            const img = images[0];
            const alt = img.getAttribute('alt');
            const text = document.createTextNode(alt);
            img.parentNode.replaceChild(text, img);
        }
        let plainName = tempDiv.textContent || "";
        plainName = plainName.trim();

        if (!plainName || plainName === room.name) {
            setIsEditingName(false);
            return;
        }
        setNameLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/name`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: plainName })
            });
            if (res.ok) {
                setIsEditingName(false);
                setShowNameEmoji(false);
                // room update via socket will update UI
            }
        } catch (err) {
            console.error(err);
        } finally {
            setNameLoading(false);
        }
    };

    const handleNameEmojiClick = (emojiData) => {
        const hex = emojiData.unified.split('-').filter(c => c !== 'fe0f').join('-');
        const imageUrl = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`;
        const imageTag = `<img src="${imageUrl}" alt="${emojiData.emoji}" class="w-6 h-6 inline-block align-bottom" style="margin: 0 1px;" draggable="false" />`;

        if (nameRange.current) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(nameRange.current);
        } else if (nameInputRef.current) {
            nameInputRef.current.focus();
        }

        document.execCommand('insertHTML', false, imageTag);
        saveNameSelection();
    };

    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            lastRange.current = selection.getRangeAt(0);
        }
    };


    const myMember = members.find(m => String(m.id) === String(currentUser?.id));
    const myRole = myMember?.role || 'member';
    const isOwner = myRole === 'owner' || String(room.created_by) === String(currentUser?.id);
    const isAdmin = myRole === 'admin';
    const canManageMembers = isOwner || isAdmin;
    
    // Permissions logic for UI - temporarily allowing everyone to see it for debugging if they are not owner? 
    // No, better to stick to logic but assume the user is owner.
    // If logic fails, user won't see it.
    // Let's also debug by enabling it if I'm the creator based on room data too.
    const isCreator = String(room.created_by) === String(currentUser?.id);
    const canSeeSettings = isOwner || isAdmin || isCreator;

    const fetchPermissions = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/permissions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPermissions(data);
            }
        } catch (error) {
            console.error("Failed to fetch permissions", error);
        }
    };

    const fetchMembers = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setMembers(data);
            }
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        if (!socket) return;

        const handleAvatarUpdate = ({ userId, avatar_url, avatar_thumb_url }) => {
            setMembers(prev => prev.map(m => {
                if (String(m.id) === String(userId)) {
                    return { ...m, avatar_thumb_url, avatar_url };
                }
                return m;
            }));
        };

        const handleAvatarDelete = ({ userId }) => {
            setMembers(prev => prev.map(m => {
                if (String(m.id) === String(userId)) {
                    return { ...m, avatar_thumb_url: null, avatar_url: null };
                }
                return m;
            }));
        };


        const handleRoomUpdate = (data) => {
            if (String(data.roomId) === String(room.id)) {
                if (data.bio !== undefined) setLocalBio(data.bio);
                if (data.avatar_url !== undefined) {
                    setLocalAvatar(data.avatar_url);
                    setLocalAvatarThumb(data.avatar_thumb_url);
                }
            }
        };


        const handleMemberRoleUpdate = ({ groupId, userId, role }) => {
            if (String(groupId) === String(room.id)) {
                setMembers(prev => prev.map(m => m.id == userId ? { ...m, role } : m));
            }
        };

        const handleOwnershipTransferred = ({ groupId, oldOwnerId, newOwnerId }) => {
            if (String(groupId) === String(room.id)) {
                setMembers(prev => prev.map(m => {
                    if (m.id == oldOwnerId) return { ...m, role: 'admin' };
                    if (m.id == newOwnerId) return { ...m, role: 'owner' };
                    return m;
                }));
            }
        };

        const handlePermissionsUpdated = ({ groupId, permissions }) => {
             if (String(groupId) === String(room.id)) {
                 setPermissions(permissions);
             }
        };

        const handleMemberAdded = ({ groupId, userId, role }) => {
             if (String(groupId) === String(room.id)) {
                 fetchMembers(); // easier to refetch to get details
             }
        };
        
        const handleMemberRemoved = ({ groupId, userId }) => {
             if (String(groupId) === String(room.id)) {
                 setMembers(prev => prev.filter(m => m.id != userId));
             }
        };

        socket.on('user:avatar:updated', handleAvatarUpdate);
        socket.on('user:avatar:deleted', handleAvatarDelete);
        socket.on('room:updated', handleRoomUpdate);
        socket.on('group:member:role-updated', handleMemberRoleUpdate);
        socket.on('group:ownership:transferred', handleOwnershipTransferred);
        socket.on('group:permissions:updated', handlePermissionsUpdated);
        socket.on('group:member:added', handleMemberAdded);
        socket.on('group:member:removed', handleMemberRemoved);

        return () => {
            socket.off('user:avatar:updated', handleAvatarUpdate);
            socket.off('user:avatar:deleted', handleAvatarDelete);
            socket.off('room:updated', handleRoomUpdate);
            socket.off('group:member:role-updated', handleMemberRoleUpdate);
            socket.off('group:ownership:transferred', handleOwnershipTransferred);
            socket.off('group:permissions:updated', handlePermissionsUpdated);
            socket.off('group:member:added', handleMemberAdded);
            socket.off('group:member:removed', handleMemberRemoved);
        };
    }, [socket, room.id]);

    // Sanitize BIO: Allow only text and <img> tags with specific visuals
    const sanitizeBio = (html) => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Recursively clean nodes
        const clean = (node) => {
            if (node.nodeType === 3) return; // Text node - OK
            if (node.nodeType === 1) {
                if (node.tagName.toLowerCase() === 'img') {
                    // Check if it's our emoji
                    const src = node.getAttribute('src');
                    const isAppleEmoji = src && src.includes('emoji-datasource-apple');
                    
                    if (!isAppleEmoji) {
                        node.remove();
                        return;
                    }
                    // Keep just essential attributes
                    const alt = node.getAttribute('alt');
                    const cleanImg = document.createElement('img');
                    cleanImg.src = src;
                    cleanImg.alt = alt;
                    cleanImg.className = "w-5 h-5 inline-block align-text-bottom mx-0.5 select-none pointer-events-none";
                    cleanImg.draggable = false;
                    node.replaceWith(cleanImg);
                    return;
                }
                
                // For other tags (div, p, span, br), unwrap or keep text content + br
                if (node.tagName.toLowerCase() === 'br') return; 
                
                // Unwrap others
                while (node.firstChild) {
                    node.parentNode.insertBefore(node.firstChild, node);
                }
                node.parentNode.removeChild(node);
            }
        };

        let sanitized = tempDiv.innerHTML
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, "")
            .replace(/on\w+="[^"]*"/g, ""); // strip handlers
            
        return sanitized; 
    };

    const handleSaveBio = async () => {
        if (!permissions.allow_description_change && !canManageMembers) return;
        setBioLoading(true);

        // Save sanitized HTML
        const content = sanitizeBio(editedBio);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/bio`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ bio: content })
            });

            if (res.ok) {
                const data = await res.json();
                setLocalBio(data.bio);
                setIsEditingBio(false);
                setShowEmoji(false);
            }
        } catch (error) {
            console.error("Failed to update group bio", error);
        } finally {
            setBioLoading(false);
        }
    };

    const handleEmojiClick = (emojiData) => {
        const hex = emojiData.unified.split('-').filter(c => c !== 'fe0f').join('-');
        const imageUrl = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`;
        const imageTag = `<img src="${imageUrl}" alt="${emojiData.emoji}" class="w-5 h-5 inline-block align-text-bottom mx-0.5 select-none pointer-events-none" draggable="false" />`;
        
        if (lastRange.current) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(lastRange.current);
        } else if (editorRef.current) {
            editorRef.current.focus();
        }

        document.execCommand('insertHTML', false, imageTag);
        saveSelection();
    };

    const copyToClipboard = (text, type) => {
        navigator.clipboard.writeText(text);
        setCopySuccess(type);
        setTimeout(() => setCopySuccess(''), 2000);
    };

    const handleKick = async (userId) => {
        if (!confirm('Remove this member?')) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to remove member');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handlePromote = async (userId) => {
         // Optimistic? No, wait for socket
         try {
             await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members/${userId}/promote`, {
                 method: 'POST', headers: { Authorization: `Bearer ${token}` }
             });
         } catch(e) { console.error(e); }
    };

    const handleDemote = async (userId) => {
         try {
             await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members/${userId}/demote`, {
                 method: 'POST', headers: { Authorization: `Bearer ${token}` }
             });
         } catch(e) { console.error(e); }
    };
    
    const handleAddMember = async (idOrUsername, isId = false) => {
        const payload = isId ? { userId: idOrUsername } : { username: idOrUsername };
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to add member');
        }
        return data;
    };

    const handlePermissionChange = async (key, value) => {
        const patch = { ...permissions, [key]: value };
        setPermissions(patch); // Optimistic
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/permissions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ [key]: value })
            });
        } catch (err) {
            console.error(err);
             // Revert?
        }
    };

    const inviteLink = `${window.location.origin}/invite?code=${room.code}`;

    // Permissions logic for UI
    // Permissions logic for UI variables were moved up. 
    // Keeping only what's needed here if any, or removing duplicates.
    const canEditBio = isOwner || isAdmin || (permissions.allow_description_change); 
    const showEditBio = isOwner || isAdmin || permissions.allow_description_change;
    
    // ... existing helpers ...

    const handleAvatarSuccess = (data) => {
        setLocalAvatar(data.avatar_url);
        setLocalAvatarThumb(data.avatar_thumb_url);
    };

    // Sub-view rendering
    if (view === 'permissions') {
        return (
            <div className="fixed inset-0 bg-gray-900/80 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-colors duration-300">
                 <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-[80vh] animate-modal-scale overflow-hidden transition-colors">
                    <GroupPermissionsView 
                        permissions={permissions}
                        onPermissionChange={handlePermissionChange}
                        onBack={() => setView('main')}
                    />
                 </div>
            </div>
        );
    }
    
    if (view === 'participants') {
         return (
            <div className="fixed inset-0 bg-gray-900/80 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-colors duration-300">
                 <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-[80vh] animate-modal-scale overflow-hidden transition-colors">
                    <GroupParticipantsView 
                        room={room}
                        members={members}
                        currentUser={currentUser}
                        permissions={permissions}
                        isOwner={isOwner}
                        isAdmin={isAdmin}
                        onAddMember={handleAddMember}
                        onKick={handleKick}
                        onPromote={handlePromote}
                        onDemote={handleDemote}
                        onBack={() => setView('main')}
                    />
                 </div>
            </div>
        );
    }

    if (view === 'transfer_ownership') {
        return (
            <GroupOwnershipTransferView 
                room={room}
                members={members}
                currentUser={currentUser}
                onTransfer={handleTransferOwnership}
                onBack={() => setView('main')}
                isTransferring={isTransferring}
            />
        );
    }

    return (
        <div className="fixed inset-0 bg-gray-900/80 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-colors duration-300">
             {/* Full Screen Image Modal */}
            {fullScreenImage && (
                <ImageViewerModal
                    images={[{ src: fullScreenImage, alt: room.name || "Group Photo" }]}
                    onClose={() => setFullScreenImage(null)}
                />
            )}

            {/* Avatar Editor Modal */}
            <AvatarEditorModal
                isOpen={isAvatarModalOpen}
                onClose={() => setIsAvatarModalOpen(false)}
                uploadUrl={`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/avatar/presign`}
                completeUrl={`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/avatar/complete`}
                deleteUrl={`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/avatar`}
                onSuccess={handleAvatarSuccess}
                aspect={1}
            />

            <div className="bg-white dark:bg-slate-900 w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-2xl border-0 md:border md:border-slate-200 md:dark:border-slate-800 shadow-2xl flex flex-col animate-modal-scale transition-colors overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/50 transition-colors">
                    <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="relative group shrink-0">
                            <button 
                                onClick={() => localAvatar && setFullScreenImage(localAvatar)}
                                className={`w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-bold text-xl border-2 border-slate-200 dark:border-slate-700/50 transition-transform ${localAvatar ? 'hover:scale-105 cursor-zoom-in' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-default'}`}
                            >
                                {localAvatarThumb ? (
                                    <img src={localAvatarThumb} alt={room.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span>{room.name?.[0]?.toUpperCase()}</span>
                                )}
                            </button>
                            
                            {/* Edit Pencil */}
                            {canManageMembers && (
                                <button
                                    onClick={() => setIsAvatarModalOpen(true)}
                                    className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-white p-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-lg transition-colors"
                                    title="Change Photo"
                                >
                                    <span className="material-symbols-outlined text-[14px] flex">edit</span>
                                </button>
                            )}
                        </div>

                        <div>
                            {isEditingName ? (
                                <div className="flex items-center gap-2 relative">
                                    <div className="flex flex-col w-[200px] sm:w-[300px] mr-2">
                                        <div className="relative flex items-center w-full bg-white dark:bg-slate-800 border border-violet-500 rounded-lg transition-shadow focus-within:shadow-[0_0_0_2px_rgba(139,92,246,0.2)]">
                                            <ContentEditable
                                                innerRef={nameInputRef}
                                                html={editedName}
                                                onChange={(e) => {
                                                    setEditedName(e.target.value);
                                                    saveNameSelection();
                                                }}
                                                onKeyUp={saveNameSelection}
                                                onMouseUp={saveNameSelection}
                                                onPaste={(e) => {
                                                    e.preventDefault();
                                                    const text = e.clipboardData.getData('text/plain');
                                                    
                                                    // Calculate current length
                                                    const temp = document.createElement('div');
                                                    temp.innerHTML = e.currentTarget.innerHTML;
                                                    temp.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
                                                    const currentLength = temp.textContent.length;
                                                    
                                                    const remaining = 64 - currentLength;
                                                    if (remaining > 0) {
                                                        const toInsert = text.slice(0, remaining);
                                                        document.execCommand('insertText', false, toInsert);
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleSaveName();
                                                        return;
                                                    }
                                                    if (e.key === 'Escape') {
                                                        setIsEditingName(false);
                                                        return;
                                                    }
                                                    
                                                    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                                                        // Calculate current length accurately
                                                        const temp = document.createElement('div');
                                                        temp.innerHTML = e.currentTarget.innerHTML;
                                                        temp.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
                                                        const currentLength = temp.textContent.length;
                                                        
                                                        if (currentLength >= 64) {
                                                            e.preventDefault();
                                                        }
                                                    }
                                                }}
                                                className="flex-1 min-w-0 bg-transparent text-slate-800 dark:text-white text-lg font-bold px-3 py-1.5 outline-none whitespace-nowrap overflow-x-auto no-scrollbar"
                                                tagName="div"
                                            />
                                            <button
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => setShowNameEmoji(!showNameEmoji)}
                                                className="shrink-0 w-8 h-8 flex items-center justify-center mr-1 text-slate-400 hover:text-violet-500 dark:text-slate-500 dark:hover:text-violet-400 transition-colors rounded-full"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                                            </button>

                                            {showNameEmoji && (
                                                <div className="absolute top-full right-0 mt-2 z-50 shadow-2xl rounded-lg w-[min(320px,90vw)] h-[400px] overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 animate-scale-up origin-top-right">
                                                    <PickerPanel 
                                                        onEmojiClick={handleNameEmojiClick}
                                                        disableGifTab={true}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 text-right mt-1 px-1 font-mono">
                                            {(() => {
                                                const temp = document.createElement('div');
                                                temp.innerHTML = editedName;
                                                temp.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
                                                return temp.textContent.length;
                                            })()}/64
                                        </div>
                                    </div>
                                    
                                    <button onClick={handleSaveName} disabled={nameLoading} className="text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 p-1">
                                        <span className="material-symbols-outlined">check_circle</span>
                                    </button>
                                    <button onClick={() => setIsEditingName(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">
                                        <span className="material-symbols-outlined">cancel</span>
                                    </button>
                                </div>
                            ) : (
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2 group/name transition-colors">
                                    <span className="flex items-center gap-1">{linkifyText(room.name)}</span>
                                    {(isOwner || isAdmin || permissions.allow_name_change) && (
                                        <button 
                                            onClick={() => {
                                                setEditedName(textToHtml(room.name));
                                                setIsEditingName(true);
                                                setShowNameEmoji(false);
                                            }}
                                            className="opacity-0 group-hover/name:opacity-100 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white transition-opacity"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">edit</span>
                                        </button>
                                    )}
                                </h3>
                            )}
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">#{room.code}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors rounded-full">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>


                {/* Content */}
                <div className="overflow-y-auto custom-scrollbar flex-1">

                    {/* Group Description/Bio */}
                    <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 bg-gray-50/30 dark:bg-slate-900/30 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                             <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider">Group Description</h3>
                             {showEditBio && !isEditingBio && (
                                <button 
                                    onClick={() => {
                                        setEditedBio(localBio || '');
                                        setIsEditingBio(true);
                                    }}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">edit</span>
                                </button>
                             )}
                        </div>

                         {isEditingBio ? (
                            <div className="space-y-2 relative">
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 focus-within:border-violet-500 transition-colors relative">
                                    <ContentEditable
                                        innerRef={editorRef}
                                        html={editedBio}
                                        disabled={bioLoading}
                                        onChange={(evt) => {
                                            setEditedBio(evt.target.value);
                                            saveSelection();
                                        }}
                                        onKeyUp={saveSelection}
                                        onMouseUp={saveSelection}
                                        onPaste={(e) => {
                                            e.preventDefault();
                                            const text = e.clipboardData.getData('text/plain');
                                            
                                            // Calculate current length
                                            const temp = document.createElement('div');
                                            temp.innerHTML = e.currentTarget.innerHTML;
                                            temp.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
                                            const currentLength = temp.textContent.length;
                                            
                                            const remaining = 500 - currentLength;
                                            if (remaining > 0) {
                                                const toInsert = text.slice(0, remaining);
                                                document.execCommand('insertText', false, toInsert);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') {
                                                setIsEditingBio(false);
                                                return;
                                            }
                                            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                                                // Calculate current length accurately
                                                const temp = document.createElement('div');
                                                temp.innerHTML = e.currentTarget.innerHTML;
                                                temp.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
                                                const currentLength = temp.textContent.length;
                                                
                                                if (currentLength >= 500) {
                                                    e.preventDefault();
                                                }
                                            }
                                        }}
                                        className="w-full text-slate-800 dark:text-slate-200 text-sm outline-none bg-transparent min-h-[80px] max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar"
                                        tagName="div"
                                    />
                                    {!editedBio && (
                                        <div className="text-slate-400 dark:text-slate-500 text-sm pointer-events-none absolute top-3 left-3">Add a group description...</div>
                                    )}
                                    <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono pointer-events-none bg-white/80 dark:bg-slate-800/80 px-1 rounded-sm">
                                        {(() => {
                                            const temp = document.createElement('div');
                                            temp.innerHTML = editedBio;
                                            // Handle emoji images counting as their alt text
                                            temp.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
                                            return temp.textContent.length;
                                        })()}/500
                                    </div>
                                </div>

                                <div className="flex justify-between items-center">
                                    <div className="relative">
                                        <button 
                                            onClick={() => setShowEmoji(!showEmoji)}
                                            className={`p-2 transition-colors flex items-center justify-center rounded-lg ${showEmoji ? 'text-violet-500 bg-violet-50 dark:bg-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                                            title="Insert Emoji"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                                        </button>
                                         {showEmoji && (
                                            <div className="absolute top-full left-0 mt-2 z-50 shadow-2xl rounded-lg w-[min(320px,90vw)] h-[400px] overflow-hidden border border-slate-200 dark:border-slate-700">
                                                <PickerPanel 
                                                    onEmojiClick={handleEmojiClick}
                                                    disableGifTab={true}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-2">
                                        <button 
                                            onClick={() => {
                                                setIsEditingBio(false);
                                                setShowEmoji(false);
                                            }}
                                            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                            disabled={bioLoading}
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleSaveBio}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors flex items-center gap-1"
                                            disabled={bioLoading}
                                        >
                                            {bioLoading && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                                            Save
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div 
                                    className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap break-words transition-colors"
                                    dangerouslySetInnerHTML={{ __html: localBio || '<span class="text-slate-400 dark:text-slate-600 italic">No description</span>' }}
                                />
                                
                                {/* Creator Info */}
                                {room.created_at && (
                                    <div className="text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-200 dark:border-slate-800/50">
                                        Group created by{' '}
                                        <span className="text-slate-700 dark:text-slate-400 font-bold flex items-center gap-1 inline-flex align-bottom">
                                            {Number(room.created_by) === Number(currentUser?.id) ? 'You' : (renderTextWithEmojis(room.creator_name) || 'an unknown user')}
                                        </span>
                                        , on {new Date(room.created_at).toLocaleString(undefined, {
                                            day: '2-digit', month: '2-digit', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* Shared Media */}
                    <div className="border-b border-slate-200/50 dark:border-slate-800/50 transition-colors">
                         <h3 className="text-slate-500 font-bold text-xs uppercase px-6 pt-6 mb-2 tracking-wider">Shared Content</h3>
                         <div className="px-4 pb-6">
                            <SharedMedia roomId={room.id} onGoToMessage={onGoToMessage} />
                         </div>
                    </div>
                    
                    {/* Share Section (Only for Groups) */}
                    {room.type === 'group' && (
                        <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 bg-gray-50/30 dark:bg-slate-900/30 transition-colors">
                            <div className="flex flex-col sm:flex-row gap-6 items-center">
                                {/* QR Code */}
                                <div className="bg-white p-3 rounded-lg shadow-lg shrink-0 hidden sm:block">
                                    <QRCodeSVG value={inviteLink} size={100} level="M" />
                                </div>

                                {/* Share Details */}
                                <div className="flex-1 w-full space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Group Code</label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-white dark:bg-slate-800/80 h-10 flex items-center justify-center rounded-lg font-mono text-lg tracking-widest text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700/50 transition-colors">
                                                {room.code}
                                            </div>
                                            <button 
                                                onClick={() => copyToClipboard(room.code, 'code')}
                                                className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-all ${
                                                    copySuccess === 'code'
                                                    ? 'bg-emerald-50 border-emerald-500/50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' 
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600'
                                                }`}
                                                title="Copy Code"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">{copySuccess === 'code' ? 'check' : 'content_copy'}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Universal Invite Link</label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-white dark:bg-slate-800/50 h-10 flex items-center px-3 rounded-lg text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50 truncate font-mono select-all transition-colors">
                                                {inviteLink}
                                            </div>
                                            <button 
                                                onClick={() => copyToClipboard(inviteLink, 'link')}
                                                className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-all ${
                                                    copySuccess === 'link'
                                                    ? 'bg-emerald-50 border-emerald-500/50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' 
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600'
                                                }`}
                                                title="Copy Link"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">{copySuccess === 'link' ? 'check' : 'link'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Navigation Buttons for Sub-pages */}
                    <div className="p-0">
                             {(isOwner || isAdmin) && (
                                 <button 
                                    onClick={() => setView('permissions')}
                                    className="w-full flex items-center justify-between p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-200/50 dark:border-slate-800/50"
                                 >
                                     <div className="flex items-center gap-3">
                                         <span className="material-symbols-outlined text-slate-400">tune</span>
                                         <span className="text-slate-700 dark:text-slate-200 font-medium">Permissions</span>
                                     </div>
                                     <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                                 </button>
                             )}

                         <button 
                            onClick={() => setView('participants')}
                            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-200/50 dark:border-slate-800/50"
                         >
                             <div className="flex items-center gap-3">
                                 <span className="material-symbols-outlined text-slate-400">group</span>
                                 <span className="text-slate-700 dark:text-slate-200 font-medium">Participants</span>
                             </div>
                             <div className="flex items-center gap-2">
                                 <span className="text-xs text-slate-500">{members.length}</span>
                                 <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                             </div>
                         </button>
                    </div>

                    {/* Danger Zone */}
                    <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 bg-gray-50/30 dark:bg-slate-900/30 transition-colors">
                        <div className="space-y-3">
                            {/* Clear Messages - Visible to everyone */}
                            <button
                                onClick={async () => {
                                    if (!confirm('Clear all messages in this chat? This will only affect you.')) return;
                                    try {
                                        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/clear`, {
                                            method: 'POST',
                                            headers: { Authorization: `Bearer ${token}` }
                                        });
                                        if (res.ok) {
                                            // Handle success (maybe show toast? or just close)
                                            alert('Chat history cleared.');
                                            onClose();
                                        }
                                    } catch (err) {
                                        console.error(err);
                                    }
                                }}
                                className="w-full flex items-center gap-3 text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 transition-colors p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 text-left"
                            >
                                <span className="material-symbols-outlined">cleaning_services</span>
                                <div className="flex flex-col">
                                    <span className="font-bold text-sm">Clear Messages</span>
                                    <span className="text-[10px] text-amber-500/70 dark:text-amber-400/70">Clear chat history (for you only)</span>
                                </div>
                            </button>

                            {/* Leave Group - Visible to everyone */}
                            <button
                                onClick={handleLeaveClick}
                                className="w-full flex items-center gap-3 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-left"
                            >
                                <span className="material-symbols-outlined">logout</span>
                                <div className="flex flex-col">
                                    <span className="font-bold text-sm">Leave Group</span>
                                    <span className="text-[10px] text-red-500/70 dark:text-red-400/70">Leave this group chat</span>
                                </div>
                            </button>

                            {/* Delete Group - Owner Only */}
                            {isOwner && (
                                <button
                                    onClick={async () => {
                                        if (!confirm('Are you certain you want to DELETE this group? This cannot be undone and will remove it for EVERYONE.')) return;
                                        // Specific confirm logic could be more robust (e.g. type name), but strict confirm is okay for now.
                                        try {
                                            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/destroy`, {
                                                method: 'DELETE',
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            if (res.ok) {
                                                onClose();
                                                // Dashboard socket listener handles removal
                                            } else {
                                                const err = await res.json();
                                                alert(err.error || 'Failed to delete group');
                                            }
                                        } catch (err) {
                                            console.error(err);
                                        }
                                    }}
                                    className="w-full flex items-center gap-3 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-left"
                                >
                                    <span className="material-symbols-outlined">delete_forever</span>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm">Delete Group</span>
                                        <span className="text-[10px] text-red-500/70 dark:text-red-400/70">Permanently delete this group for everyone</span>
                                    </div>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

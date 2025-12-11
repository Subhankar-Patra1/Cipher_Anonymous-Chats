import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import StatusDot from './StatusDot';
import AvatarEditorModal from './AvatarEditorModal';
import PickerPanel from './PickerPanel';
import ContentEditable from 'react-contenteditable';
import { linkifyText } from '../utils/linkify';

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

export default function ProfilePanel({ userId, onClose, roomId, onActionSuccess }) {
    const { token, user: currentUser } = useAuth();
    const { presenceMap, fetchStatuses } = usePresence();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showFullBio, setShowFullBio] = useState(false);
    
    const [confirmModal, setConfirmModal] = useState(null); // { type: 'clear' | 'delete', title: string, destructive: boolean }
    const [actionLoading, setActionLoading] = useState(false);
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [viewingImage, setViewingImage] = useState(null);

    const [isEditingBio, setIsEditingBio] = useState(false);
    const [editedBio, setEditedBio] = useState('');
    const [bioLoading, setBioLoading] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);
    
    // Refs for rich text editor
    const editorRef = useRef(null);
    const lastRange = useRef(null);

    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
                lastRange.current = range.cloneRange();
            }
        }
    };

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
                if (node.tagName.toLowerCase() === 'br') return; // Keep breaks
                
                // Unwrap others
                while (node.firstChild) {
                    node.parentNode.insertBefore(node.firstChild, node);
                }
                node.parentNode.removeChild(node);
            }
        };

        // Simple pass - could be improved but sufficient for this controlled input
        // Since we are iterating live collection or modifying structure, simplistic approach:
        // Just extract text and imgs? 
        // Better: Valid content is text, br, and img.
        // Let's rely on stripping style/scripts mostly.
        
        let sanitized = tempDiv.innerHTML
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, "")
            .replace(/on\w+="[^"]*"/g, ""); // strip handlers
            
        return sanitized; 
    };

    const getBioLength = (html) => {
        // Replace images with a single character placeholder to count them as 1
        // We use a specific placeholder that doesn't get messed up by HTML parsing, although any char works if we use textContent
        const withPlaceholders = html.replace(/<img[^>]*>/g, '❄'); 
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = withPlaceholders;
        // Use textContent to get raw text length. 
        // Note: Newlines in ContentEditable might be represented by divs or brs. 
        // textContent might strip visual newlines from blocks if not careful, 
        // but for a simple character count it is usually sufficient standard.
        // For accurate newline counting 'innerText' is better but can be slower. 
        // Given 140 chars, innerText is fine.
        return tempDiv.innerText.replace(/[\n\r]+/g, '').length; 
    };

    const handleSaveBio = async () => {
        const currentLength = getBioLength(editedBio);
        if (currentLength > 140) return;

        setBioLoading(true);
        
        // Sanitize before saving
        // We want to KEEP the HTML tags for emojis
        // But removing <div> wrapper artifacts from ContentEditable would be nice if any
        // ContentEditable often emits <div><br></div> for newlines.
        
        const content = sanitizeBio(editedBio); 

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me/bio`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ bio: content })
            });
            
            if (res.ok) {
                const data = await res.json();
                setProfile(prev => ({ ...prev, bio: data.bio }));
                setIsEditingBio(false);
                setShowEmoji(false);
                if (onActionSuccess) onActionSuccess('bio_update');
            }
        } catch (err) {
            console.error("Failed to update bio", err);
        } finally {
            setBioLoading(false);
        }
    };


    const handleEmojiClick = (emojiData) => {
        if (getBioLength(editedBio) >= 140) return;

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

    const isMe = currentUser && String(currentUser.id) === String(userId);
    const status = isMe ? { online: true } : presenceMap[userId];

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/${userId}/profile`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setProfile(data);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (userId) {
            fetchProfile();
            fetchStatuses([userId]);
        }
    }, [userId, token]);

    // Handle Esc key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (confirmModal) setConfirmModal(null);
                else onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, confirmModal]);

    const handleClearMessages = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/clear`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ scope: 'me' })
            });

            if (res.ok) {
                setConfirmModal(null);
                // The socket event will handle the UI update usually, but we can also trigger callback
                if (onActionSuccess) onActionSuccess('clear');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteChat = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}?scope=me`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                setConfirmModal(null);
                onClose(); // Close panel first
                if (onActionSuccess) onActionSuccess('delete');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return createPortal(
            <div className="fixed inset-y-0 right-0 w-[360px] bg-white dark:bg-slate-900 shadow-2xl z-[60] flex items-center justify-center border-l border-slate-200 dark:border-slate-800 transition-colors duration-300">
                <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full"></div>
            </div>,
            document.body
        );
    }

    if (!profile) return null;

    const avatarSource = profile.avatar_url || profile.avatar_thumb_url;

    return createPortal(
        <>
            {/* Backdrop for mobile mostly, or consistent UI */}
            <div className="fixed inset-0 bg-black/20 z-[50]" onClick={onClose} />

            {/* Panel */}
            <div 
                className="fixed inset-y-0 right-0 w-full md:w-[360px] bg-white dark:bg-slate-900 shadow-2xl z-[60] border-l border-slate-200 dark:border-slate-800 flex flex-col animate-slide-in-right transform transition-transform duration-300 ease-in-out"
                role="dialog"
                aria-label={`Profile for ${profile.display_name}`}
            >
                {/* Header */}
                <div className="h-16 flex items-center px-4 bg-gray-50/80 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 transition-colors">
                    <button onClick={onClose} className="mr-4 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Contact Info</h2>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900 transition-colors">
                    {/* Profile Header */}
                    <div className="p-6 flex flex-col items-center border-b border-slate-200/50 dark:border-slate-800/50 bg-gray-50/30 dark:bg-slate-900 transition-colors">
                         {/* Avatar */}
                         <div className="relative group mb-4">
                            <div 
                                className={`w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-xl overflow-hidden border-[3px] border-white dark:border-slate-800 ${!avatarSource ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-200 dark:bg-slate-800'} ${avatarSource ? 'cursor-pointer' : ''} transition-colors`}
                                onClick={() => {
                                    if (avatarSource) setViewingImage(avatarSource);
                                }}
                            >
                                {avatarSource ? (
                                    <img src={avatarSource} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    profile.display_name?.[0]?.toUpperCase()
                                )}
                            </div>
                            {isMe && (
                                <button 
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="absolute bottom-1 right-1 bg-white dark:bg-slate-800 rounded-full p-1.5 shadow-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-300 hover:text-violet-600 dark:hover:text-white flex items-center justify-center"
                                >
                                    <span className="material-symbols-outlined text-[18px] drop-shadow-md">edit</span>
                                </button>
                            )}
                        </div>

                        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1 text-center transition-colors">{profile.display_name}</h2>
                        <p className="text-slate-500 text-sm mb-2">{profile.username}</p>
                        
                        {!isMe && (
                            <div className="text-sm font-medium">
                                {status?.online ? (
                                    <span className="text-emerald-500">Online now</span>
                                ) : (
                                    <span className="text-slate-400 dark:text-slate-500">
                                        {status?.last_seen 
                                            ? `Last seen ${timeAgo(status.last_seen)}`
                                            : profile.last_seen ? `Last seen ${timeAgo(profile.last_seen)}` : ''
                                        }
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bio */}
                    <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">About</h3>
                            {isMe && !isEditingBio && (
                                <button 
                                    onClick={() => {
                                        setEditedBio(profile.bio || '');
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
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 focus-within:border-violet-500 transition-colors">
                                    <ContentEditable
                                        innerRef={editorRef}
                                        html={editedBio}
                                        disabled={bioLoading}
                                        onChange={(evt) => {
                                            const newVal = evt.target.value;
                                            if (getBioLength(newVal) > 140) {
                                                // Limit exceeded. Do not update state.
                                                // Manually revert the DOM divergence because react-contenteditable might not if prop doesn't change.
                                                if (editorRef.current) {
                                                    // Restore the previous valid HTML
                                                    editorRef.current.innerHTML = editedBio;
                                                    
                                                    // Move cursor to the end of the content
                                                    // This is a safe fallback to avoid jumping to the start
                                                    try {
                                                        const range = document.createRange();
                                                        range.selectNodeContents(editorRef.current);
                                                        range.collapse(false); // false = to end
                                                        const selection = window.getSelection();
                                                        selection.removeAllRanges();
                                                        selection.addRange(range);
                                                    } catch (err) {
                                                        console.error("Failed to restore cursor", err);
                                                    }
                                                }
                                                return;
                                            }
                                            setEditedBio(newVal);
                                            // Save selection AFTER update is accepted
                                            // We need to wait for render usually for the range to be valid in new structure, 
                                            // but with contentEditable, selection serves as 'current cursor position'.
                                            // We save it so we can restore if needed.
                                            saveSelection();
                                        }}
                                        onKeyDown={(e) => {
                                            const isControlKey = [
                                                'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 
                                                'Home', 'End', 'Tab'
                                            ].includes(e.key);
                                            const isShortcut = (e.ctrlKey || e.metaKey) && ['a', 'c', 'x', 'v'].includes(e.key.toLowerCase());
                                            
                                            // Allow control keys and shortcuts
                                            if (isControlKey || isShortcut) return;

                                            // Check if we are selecting text (replacement is allowed)
                                            const selection = window.getSelection();
                                            const isTextSelected = selection.toString().length > 0;

                                            if (getBioLength(editedBio) >= 140 && !isTextSelected) {
                                                e.preventDefault();
                                            }
                                            saveSelection();
                                        }}
                                        onPaste={(e) => {
                                            e.preventDefault();
                                            const text = e.clipboardData.getData('text/plain');
                                            
                                            // Calculate available space
                                            const currentLen = getBioLength(editedBio);
                                            // Check selection length to account for replacement
                                            const selection = window.getSelection();
                                            const selectedTextLen = selection.toString().length;
                                            
                                            const available = 140 - (currentLen - selectedTextLen);
                                            
                                            if (available <= 0) return;
                                            
                                            const toPaste = text.slice(0, available);
                                            document.execCommand('insertText', false, toPaste);
                                        }}
                                        onKeyUp={saveSelection}
                                        onMouseUp={saveSelection}
                                        className="w-full text-slate-800 dark:text-slate-200 text-sm outline-none bg-transparent min-h-[80px] max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar"
                                        tagName="div"
                                    />
                                    {!editedBio && (
                                        <div className="text-slate-400 dark:text-slate-500 text-sm pointer-events-none absolute top-3 left-3">Add a bio...</div>
                                    )}
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
                                            <div className="absolute top-full left-0 mt-2 z-50 shadow-2xl rounded-lg w-[320px] h-[400px] overflow-hidden border border-slate-200 dark:border-slate-700">
                                                <PickerPanel 
                                                    onEmojiClick={handleEmojiClick}
                                                    disableGifTab={true}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-2 items-center">
                                        <span className={`text-xs font-medium mr-2 ${getBioLength(editedBio) > 140 ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
                                            {getBioLength(editedBio)}/140
                                        </span>
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
                                            className={`px-3 py-1.5 text-xs font-bold text-white rounded-lg transition-colors flex items-center gap-1 ${getBioLength(editedBio) > 140 ? 'bg-slate-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'}`}
                                            disabled={bioLoading || getBioLength(editedBio) > 140}
                                        >
                                            {bioLoading && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                                            Save
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {profile.bio ? (
                                    <>
                                        <div 
                                className={`text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap break-words transition-colors ${!showFullBio && !isMe ? 'line-clamp-3' : ''}`}
                                dangerouslySetInnerHTML={{ __html: profile.bio || '<span class="text-slate-400 dark:text-slate-600 italic">No bio added</span>' }}
                            />
                            
                            {/* Simple Logic for Read More - difficult with HTML line-clamp but we can approximate length check or just always show if long text content */}
                            {profile.bio && profile.bio.replace(/<[^>]*>/g, '').length > 150 && !isMe && (
                                <button 
                                    onClick={() => setShowFullBio(!showFullBio)}
                                    className="text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 mt-1 font-medium transition-colors"
                                >
                                    {showFullBio ? 'Show less' : 'Read more'}
                                </button>
                            )}
                                    </>
                                ) : (
                                    <p className="text-slate-400 dark:text-slate-500 text-sm italic">No bio added</p>
                                )}
                            </>
                        )}
                    </div>

                    {/* Groups in Common */}
                    <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50 transition-colors">
                        <h3 className="text-slate-500 text-xs font-bold uppercase mb-3 tracking-wider flex justify-between items-center">
                            Groups in Common
                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full text-[10px] transition-colors">{profile.groups_in_common?.length || 0}</span>
                        </h3>
                        {profile.groups_in_common?.length > 0 ? (
                            <div className="space-y-2">
                                {profile.groups_in_common.map(group => (
                                    <div key={group.id} className="flex items-center gap-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer">
                                        <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0 transition-colors">
                                            <span className="material-symbols-outlined">group</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-slate-700 dark:text-slate-200 text-sm font-medium truncate flex items-center gap-1">
                                                {linkifyText(group.name)}
                                            </p>
                                            <p className="text-slate-500 text-xs">{group.member_count} members</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-slate-500 dark:text-slate-600 text-sm italic">No groups in common</p>
                        )}
                    </div>


                    {/* Actions */}
                    <div className="p-4 space-y-1">
                        {!isMe && (
                             <button 
                                onClick={onClose}
                                className="w-full flex items-center gap-4 p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors text-left group"
                            >
                                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">chat_bubble</span>
                                <span className="text-sm font-medium">Message</span>
                            </button>
                        )}
                       
                        {roomId && (
                            <>
                                <button 
                                    onClick={() => setConfirmModal({ 
                                        type: 'clear', 
                                        title: 'Clear messages in this chat?', 
                                        desc: 'These messages will be removed for you. This cannot be undone.',
                                        actionReq: handleClearMessages,
                                        destructive: true
                                    })}
                                    className="w-full flex items-center gap-4 p-3 hover:bg-red-50 dark:hover:bg-slate-800/50 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
                                >
                                    <span className="material-symbols-outlined">delete_sweep</span>
                                    <span className="text-sm font-medium">Clear messages</span>
                                </button>
                                
                                <button 
                                    onClick={() => setConfirmModal({ 
                                        type: 'delete', 
                                        title: 'Delete this chat?', 
                                        desc: 'This chat will be removed from your list. Messages will remain for other participants.',
                                        actionReq: handleDeleteChat,
                                        destructive: true
                                    })}
                                    className="w-full flex items-center gap-4 p-3 hover:bg-red-50 dark:hover:bg-slate-800/50 rounded-lg text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
                                >
                                    <span className="material-symbols-outlined">delete_forever</span>
                                    <span className="text-sm font-bold">Delete chat</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-scale-up transition-colors">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{confirmModal.title}</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">{confirmModal.desc}</p>
                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => setConfirmModal(null)}
                                className="px-4 py-2 text-slate-500 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => confirmModal.actionReq()}
                                disabled={actionLoading}
                                className={`px-4 py-2 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 ${confirmModal.destructive ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500'} transition-colors disabled:opacity-50`}
                            >
                                {actionLoading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                                {confirmModal.type === 'clear' ? 'Clear' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

             <AvatarEditorModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} />
            
            {/* Image Viewer */}
            {viewingImage && (
                <div 
                    className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
                    onClick={() => setViewingImage(null)}
                >
                    <img 
                        src={viewingImage} 
                        alt="Profile" 
                        className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain cursor-default" 
                        onClick={(e) => e.stopPropagation()} 
                    />
                    <button 
                        className="absolute top-4 right-4 text-white/50 hover:text-white p-2"
                        onClick={() => setViewingImage(null)}
                    >
                        <span className="material-symbols-outlined text-3xl">close</span>
                    </button>
                </div>
            )}
        </>,
        document.body
    );
}

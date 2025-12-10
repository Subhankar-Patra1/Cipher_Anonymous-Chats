import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import PickerPanel from './PickerPanel';
import ContentEditable from 'react-contenteditable';

export default function GroupInfoModal({ room, onClose, onLeave, onKick, socket }) {
    const { token, user: currentUser } = useAuth();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copySuccess, setCopySuccess] = useState(''); // 'code' or 'link'

    const [isEditingBio, setIsEditingBio] = useState(false);
    const [editedBio, setEditedBio] = useState('');
    const [bioLoading, setBioLoading] = useState(false);
    const [localBio, setLocalBio] = useState(room.bio || '');
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

    // Sync localBio if room prop updates (e.g. from socket elsewhere)
    useEffect(() => {
        if (room.bio !== undefined) {
            setLocalBio(room.bio);
        }
    }, [room.bio]);

    useEffect(() => {
        fetchMembers();
    }, [room.id]);

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
        } finally {
            setLoading(false);
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
            if (String(data.roomId) === String(room.id) && data.bio !== undefined) {
                 setLocalBio(data.bio);
            }
        };

        socket.on('user:avatar:updated', handleAvatarUpdate);
        socket.on('user:avatar:deleted', handleAvatarDelete);
        socket.on('room:updated', handleRoomUpdate);

        return () => {
            socket.off('user:avatar:updated', handleAvatarUpdate);
            socket.off('user:avatar:deleted', handleAvatarDelete);
            socket.off('room:updated', handleRoomUpdate);
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
                if (node.tagName.toLowerCase() === 'br') return; // Keep breaks
                
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
            if (res.ok) {
                setMembers(prev => prev.filter(m => m.id !== userId));
            }
        } catch (error) {
            console.error(error);
        }
    };

    const isOwner = members.find(m => m.id === currentUser.id)?.role === 'owner';
    const inviteLink = `${window.location.origin}/invite?code=${room.code}`;

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-800 shadow-2xl flex flex-col max-h-[90vh] animate-modal-scale">
                {/* Header */}
                <div className="p-6 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{room.name}</h3>
                        <p className="text-xs text-slate-400 font-mono">#{room.code}</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-white transition-colors rounded-full">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>


                {/* Content */}
                <div className="overflow-y-auto custom-scrollbar flex-1">

                    {/* Group Description/Bio */}
                    <div className="p-6 border-b border-slate-800/50 bg-slate-900/30">
                        <div className="flex items-center justify-between mb-2">
                             <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Group Description</h3>
                             {isOwner && !isEditingBio && (
                                <button 
                                    onClick={() => {
                                        setEditedBio(localBio || '');
                                        setIsEditingBio(true);
                                    }}
                                    className="text-slate-500 hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">edit</span>
                                </button>
                             )}
                        </div>

                         {isEditingBio ? (
                            <div className="space-y-2 relative">
                                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 focus-within:border-violet-500 transition-colors">
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
                                        className="w-full text-slate-200 text-sm outline-none bg-transparent min-h-[80px] max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar"
                                        tagName="div"
                                    />
                                    {!editedBio && (
                                        <div className="text-slate-500 text-sm pointer-events-none absolute top-3 left-3">Add a group description...</div>
                                    )}
                                </div>

                                <div className="flex justify-between items-center">
                                    <div className="relative">
                                        <button 
                                            onClick={() => setShowEmoji(!showEmoji)}
                                            className={`p-2 transition-colors flex items-center justify-center rounded-lg ${showEmoji ? 'text-white bg-slate-800' : 'text-slate-400 hover:text-white'}`}
                                            title="Insert Emoji"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                                        </button>
                                         {showEmoji && (
                                            <div className="absolute top-full left-0 mt-2 z-50 shadow-2xl rounded-lg w-[320px] h-[400px] overflow-hidden border border-slate-700">
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
                                            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
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
                            <div 
                                className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap break-words"
                                dangerouslySetInnerHTML={{ __html: localBio || '<span class="text-slate-600 italic">No description</span>' }}
                            />
                        )}
                    </div>
                    
                    {/* Share Section (Only for Groups) */}
                    {room.type === 'group' && (
                        <div className="p-6 border-b border-slate-800/50 bg-slate-900/30">
                            <div className="flex flex-col sm:flex-row gap-6 items-center">
                                {/* QR Code */}
                                <div className="bg-white p-3 rounded-lg shadow-lg shrink-0">
                                    <QRCodeSVG value={inviteLink} size={120} level="M" />
                                </div>

                                {/* Share Details */}
                                <div className="flex-1 w-full space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Group Code</label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-800/80 h-10 flex items-center justify-center rounded-lg font-mono text-lg tracking-widest text-white border border-slate-700/50">
                                                {room.code}
                                            </div>
                                            <button 
                                                onClick={() => copyToClipboard(room.code, 'code')}
                                                className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-all ${
                                                    copySuccess === 'code'
                                                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
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
                                            <div className="flex-1 bg-slate-800/50 h-10 flex items-center px-3 rounded-lg text-xs text-slate-400 border border-slate-700/50 truncate font-mono select-all">
                                                {inviteLink}
                                            </div>
                                            <button 
                                                onClick={() => copyToClipboard(inviteLink, 'link')}
                                                className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-all ${
                                                    copySuccess === 'link'
                                                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
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

                    {/* Members List */}
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Members ({members.length})</p>
                            {loading && <span className="material-symbols-outlined text-slate-600 animate-spin text-sm">progress_activity</span>}
                        </div>
                        
                        <div className="space-y-2">
                            {members.map(member => (
                                <div key={member.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        {member.avatar_thumb_url ? (
                                            <img 
                                                src={member.avatar_thumb_url} 
                                                alt={member.display_name} 
                                                className="w-8 h-8 rounded-full object-cover bg-slate-800"
                                            />
                                        ) : (
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                                member.id === currentUser.id 
                                                ? 'bg-violet-600 text-white' 
                                                : 'bg-slate-700 text-slate-300'
                                            }`}>
                                                {member.display_name[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
                                                {member.display_name}
                                                {member.id === currentUser.id && <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">You</span>}
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-medium">
                                                {member.username.startsWith('@') ? member.username : `@${member.username}`} • <span className={member.role === 'owner' ? 'text-amber-500' : ''}>{member.role}</span>
                                            </p>
                                        </div>
                                    </div>

                                    {isOwner && member.id !== currentUser.id && (
                                        <button 
                                            onClick={() => handleKick(member.id)}
                                            className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            title="Remove from group"
                                        >
                                            <span className="material-symbols-outlined text-lg">person_remove</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800/50 bg-slate-900/30">
                    <button 
                        onClick={onLeave}
                        className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-bold text-sm border border-red-500/20 transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">logout</span>
                        Leave Group
                    </button>
                </div>
            </div>
        </div>
    );
}

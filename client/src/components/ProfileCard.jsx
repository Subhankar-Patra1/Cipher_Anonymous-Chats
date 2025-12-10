import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import StatusDot from './StatusDot';
import AvatarEditorModal from './AvatarEditorModal';

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

export default function ProfileCard({ targetUser, onClose, anchorRef }) {
    const { user: currentUser, token, updateUser: updateAuthUser } = useAuth();
    const { presenceMap, fetchStatuses } = usePresence();
    const [privacyUpdating, setPrivacyUpdating] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const isMe = currentUser && String(currentUser.id) === String(targetUser.id);
    const userId = targetUser.id;
    const status = isMe ? { online: true } : presenceMap[userId];

    // Use latest data from currentUser if it's me
    const displayedUser = isMe ? currentUser : targetUser;

    // Fetch fresh status on open
    useEffect(() => {
        if (userId) {
            fetchStatuses([userId]);
        }
    }, [userId]);

    const [viewingImage, setViewingImage] = useState(null);

    const handlePrivacyChange = async (e) => {
        const newVal = e.target.value;
        setPrivacyUpdating(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me/privacy`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ share_presence: newVal })
            });

            if (res.ok) {
                 if (updateAuthUser) {
                     updateAuthUser({ share_presence: newVal });
                 }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setPrivacyUpdating(false);
        }
    };

    const avatarSource = displayedUser.avatar_url || displayedUser.avatar_thumb_url;

    return createPortal(
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal Container - Flex Centered */}
            <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none">
                <div 
                    className="w-80 rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl animate-modal-scale pointer-events-auto"
                >
                    <div className="flex flex-col items-center">
                        {/* Avatar */}
                        <div className="relative group">
                            <div 
                                className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg mb-4 overflow-hidden ${!avatarSource ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-800'} ${avatarSource ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                                onClick={() => {
                                    if (avatarSource) setViewingImage(avatarSource);
                                }}
                            >
                                {avatarSource ? (
                                    <img src={avatarSource} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    displayedUser.display_name?.[0]?.toUpperCase()
                                )}
                            </div>
                            {isMe && (
                                <button 
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="absolute bottom-4 right-0 bg-blue-600 rounded-full p-1.5 shadow-lg border-2 border-slate-900 hover:bg-blue-500 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        
                        <h3 className="text-xl font-bold text-white">{displayedUser.display_name}</h3>
                        <p className="text-slate-400 text-sm mb-4">
                            {displayedUser.username?.startsWith('@') ? displayedUser.username : `@${displayedUser.username}`}
                        </p>

                        {/* Presence Row */}
                        {!isMe && (
                            <div className="flex items-center gap-2 mb-6 bg-slate-800/50 px-3 py-1.5 rounded-full">
                                <StatusDot online={status?.online} />
                                <div className="text-sm font-medium">
                                    {status?.online ? (
                                        <span className="text-green-400">Online now</span>
                                    ) : (
                                        <span className="text-slate-500">
                                            {status?.last_seen 
                                                ? `Last seen ${timeAgo(status.last_seen)}`
                                                : 'Offline'
                                            }
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 w-full">
                            <button 
                                onClick={onClose} 
                                className="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-2 rounded-lg text-sm font-bold transition-colors"
                            >
                                Message
                            </button>
                        </div>

                        {/* Own Privacy Settings */}
                        {isMe && (
                            <div className="w-full mt-6 pt-6 border-t border-slate-800">
                                <label className="text-xs text-slate-500 uppercase font-bold mb-2 block tracking-wider">
                                    Share Presence
                                </label>
                                <select 
                                    value={currentUser?.share_presence || 'everyone'}
                                    onChange={handlePrivacyChange}
                                    disabled={privacyUpdating}
                                    className="w-full bg-slate-950 border border-slate-700 text-slate-300 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-violet-500 outline-none"
                                >
                                    <option value="everyone">Everyone</option>
                                    <option value="contacts">My Contacts</option>
                                    <option value="nobody">Nobody</option>
                                </select>
                            </div>
                        )}
                        
                        <div className="mt-4 pt-4 w-full text-center">
                             <a href="#" className="text-xs text-slate-500 hover:text-slate-300">View full profile</a>
                        </div>
                    </div>
                </div>
            </div>

            <AvatarEditorModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} />
            
            {/* Image Viewer Modal */}
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
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}
        </>,
        document.body
    );
}

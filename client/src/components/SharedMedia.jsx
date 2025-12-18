import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ImageViewerModal from './ImageViewerModal';

export default function SharedMedia({ roomId, onGoToMessage }) {
    const { token, user: currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('photos');
    const [media, setMedia] = useState([]);
    const [loading, setLoading] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);

    // Fetch media when tab changes
    useEffect(() => {
        setLoading(true);
        fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/media?type=${activeTab}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            setMedia(Array.isArray(data) ? data : []);
        })
        .catch(err => {
            console.error("Failed to fetch media", err);
            setMedia([]);
        })
        .finally(() => setLoading(false));
    }, [roomId, activeTab, token]);

    const tabs = [
        { id: 'photos', label: 'Photos', icon: 'image' },
        { id: 'videos', label: 'Videos', icon: 'videocam' }, // Includes GIFs
        { id: 'files', label: 'Files', icon: 'description' },
        { id: 'links', label: 'Links', icon: 'link' }
    ];

    const openViewer = (index) => {
        setViewerIndex(index);
        setViewerOpen(true);
    };

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex justify-center p-8">
                    <span className="material-symbols-outlined animate-spin text-slate-400 text-2xl">progress_activity</span>
                </div>
            );
        }

        if (media.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center p-8 text-slate-400 dark:text-slate-500">
                    <span className="material-symbols-outlined text-[48px] opacity-20 mb-2">
                        {tabs.find(t => t.id === activeTab).icon}
                    </span>
                    <p className="text-sm">No {activeTab} shared yet</p>
                </div>
            );
        }

        if (activeTab === 'photos') {
            const allImages = [];
            media.forEach(msg => {
                const senderName = msg.display_name || msg.username;
                const senderAvatar = msg.avatar_url || msg.avatar_thumb_url;
                const isMe = msg.user_id === currentUser?.id;

                if (msg.attachments && msg.attachments.length > 0) {
                    msg.attachments.forEach(att => {
                         allImages.push({
                             url: att.url,
                             caption: msg.caption,
                             type: 'image',
                             id: msg.id, // Parent msg id
                             date: msg.created_at,
                             senderName,
                             senderAvatar,
                             isMe,
                             messageId: msg.id
                         });
                    });
                } else if (msg.image_url) {
                    allImages.push({
                        url: msg.image_url,
                        caption: msg.caption,
                        type: 'image',
                        id: msg.id,
                        date: msg.created_at,
                        senderName,
                        senderAvatar,
                        isMe,
                        messageId: msg.id
                    });
                }
            });

            return (
                <div className="grid grid-cols-3 gap-1">
                    {allImages.map((img, idx) => (
                        <div 
                            key={`${img.id}-${idx}`}
                            className="relative aspect-square cursor-pointer overflow-hidden bg-slate-100 dark:bg-slate-800 hover:opacity-90 transition-opacity"
                            onClick={() => {
                                setViewerIndex(idx);
                                setViewerOpen(true);
                            }}
                        >
                            <img src={img.url} alt="Shared" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                    ))}
                    {viewerOpen && (
                        <ImageViewerModal 
                            images={allImages} 
                            startIndex={viewerIndex} 
                            onClose={() => setViewerOpen(false)} 
                            onGoToMessage={onGoToMessage}
                        />
                    )}
                </div>
            );
        }

        if (activeTab === 'videos') {
             // Videos/GIFs
             return (
                 <div className="space-y-2">
                     {media.map(msg => (
                         <div key={msg.id} className="flex gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors"
                              onClick={() => {
                                   const url = msg.gif_url || (msg.content && msg.content.match(/https?:\/\/\S+\.mp4/)?.[0]);
                                   if (url) window.open(url, '_blank');
                              }}
                         >
                              <div className="w-16 h-16 bg-black/10 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative">
                                   {msg.preview_url || msg.image_url ? (
                                       <img src={msg.preview_url || msg.image_url} className="w-full h-full object-cover" />
                                   ) : (
                                       <span className="material-symbols-outlined text-slate-400">play_circle</span>
                                   )}
                                   <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                       <span className="material-symbols-outlined text-white text-[20px]">play_arrow</span>
                                   </div>
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col justify-center">
                                   <p className="text-sm text-slate-700 dark:text-slate-200 truncate font-medium">
                                       {msg.type === 'gif' ? 'GIF' : 'Video'}
                                   </p>
                                   <p className="text-xs text-slate-400 dark:text-slate-500">
                                       {new Date(msg.created_at).toLocaleDateString()}
                                   </p>
                              </div>
                         </div>
                     ))}
                 </div>
             );
        }

        if (activeTab === 'files') {
            return (
                <div className="space-y-2">
                    {media.map(msg => (
                        <div key={msg.id} className="relative group flex gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors"
                             onClick={() => {
                                 if (msg.file_url) {
                                     window.open(msg.file_url, '_blank');
                                 }
                             }}
                        >
                             <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0">
                                 <span className="material-symbols-outlined">description</span>
                             </div>
                             <div className="flex-1 min-w-0 flex flex-col justify-center">
                                  <p className="text-xs text-slate-400 dark:text-slate-500">
                                      {new Date(msg.created_at).toLocaleDateString()} • {msg.display_name}
                                  </p>
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate pr-8">
                                      {/* Extract filename or show "File" */}
                                      {msg.file_name || msg.content || 'Untitled File'}
                                  </p>
                             </div>
                             
                             {/* Hover Action: Go to Message */}
                             <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onGoToMessage(msg.id);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-700 rounded-full shadow-sm border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-violet-600 dark:hover:text-violet-400 z-10"
                                title="Go to message"
                             >
                                <span className="material-symbols-outlined text-[18px]">arrow_outward</span>
                             </button>
                        </div>
                    ))}
                </div>
            );
        }

        if (activeTab === 'links') {
             return (
                 <div className="space-y-3">
                     {media.map(msg => {
                         // Extract links
                         const links = msg.content.match(/https?:\/\/[^\s]+/g) || [];
                         return links.map((link, i) => (
                             <a 
                                key={`${msg.id}-${i}`} 
                                href={link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors group"
                             >
                                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 shrink-0 group-hover:bg-sky-50 dark:group-hover:bg-sky-900/20 group-hover:text-sky-500 transition-colors">
                                      <span className="material-symbols-outlined transform -rotate-45">link</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                       <p className="text-sm text-sky-600 dark:text-sky-400 truncate hover:underline">
                                           {link}
                                       </p>
                                       <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                           {new Date(msg.created_at).toLocaleDateString()} • {msg.display_name}
                                       </p>
                                  </div>
                             </a>
                         ));
                     })}
                 </div>
             );
        }

        return null;
    };

    return (
        <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex items-center p-2 gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto hide-scrollbar">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex-1 min-w-[60px] flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs font-medium transition-all
                            ${activeTab === tab.id 
                                ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20' 
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}
                        `}
                    >
                        <span className={`material-symbols-outlined text-[20px] ${activeTab === tab.id ? 'fill-current' : ''}`}>
                            {tab.icon}
                        </span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Content for Tabs */}
            <div className="overflow-y-auto p-2 custom-scrollbar min-h-[200px] max-h-[320px]">
                {renderContent()}
            </div>
        </div>
    );
}

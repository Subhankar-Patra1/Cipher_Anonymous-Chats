import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ImageViewerModal from './ImageViewerModal';
import { SharedMediaSkeleton } from './SkeletonLoaders';
import EmptyState from './EmptyState';

export default function SharedMedia({ roomId, onGoToMessage, socket, refreshKey = 0 }) { // [NEW] Accept socket and refreshKey
    const { token, user: currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('photos');
    const [media, setMedia] = useState([]);
    const [loading, setLoading] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);
    const [downloadedIds, setDownloadedIds] = useState([]);
    const [downloadingIds, setDownloadingIds] = useState([]);
    
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(`downloadedImages_${currentUser?.id}`)) || [];
            if (JSON.stringify(saved) !== JSON.stringify(downloadedIds)) {
                setDownloadedIds(saved.map(id => String(id)));
            }
        } catch (e) {
            console.error("Failed to load downloaded images", e);
        }
    }, [currentUser?.id, viewerOpen, roomId]); // Re-check when viewer closes or room changes

    // [NEW] Listen for clear event to refetch
    useEffect(() => {
        if (!socket) return;
        const handleCleared = ({ roomId: clearedRoomId }) => {
            if (String(clearedRoomId) === String(roomId)) {
                // Refetch media
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
            }
        };

        socket.on('chat:cleared', handleCleared);
        return () => socket.off('chat:cleared', handleCleared);
    }, [socket, roomId, activeTab, token]); // Re-bind if tab changes too

    useEffect(() => {
        if (!roomId || roomId === 'undefined') {
            setMedia([]);
            setLoading(false);
            return;
        }
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
    }, [roomId, activeTab, token, refreshKey]); // [NEW] Include refreshKey

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

    const handleDownload = (e, msgId) => {
        e.stopPropagation();
        try {
            const current = JSON.parse(localStorage.getItem(`downloadedImages_${currentUser?.id}`)) || [];
            if (!current.includes(String(msgId))) {
                const updated = [...current, String(msgId)];
                localStorage.setItem(`downloadedImages_${currentUser?.id}`, JSON.stringify(updated));
                setDownloadedIds(updated);
                
                // [NEW] Notify other components (like MessageList)
                window.dispatchEvent(new CustomEvent('media:downloaded', { detail: { messageId: String(msgId) } }));
            }
        } catch (err) {
            console.error("Error updating download status:", err);
        }
    };

    const handleFakeDownload = (e, msgId) => {
        e.stopPropagation();
        if (downloadingIds.includes(String(msgId))) return;
        
        setDownloadingIds(prev => [...prev, String(msgId)]);
        
        // Simulate network delay for "downloading" feel
        setTimeout(() => {
            handleDownload(e, msgId);
            setDownloadingIds(prev => prev.filter(id => id !== String(msgId)));
        }, 1500); // 1.5s delay
    };

    const renderContent = () => {
        if (loading) {
            return <SharedMediaSkeleton count={activeTab === 'photos' ? 9 : 4} type={activeTab} />;
        }

        if (media.length === 0) {
            const emptyMessages = {
                photos: 'No photos shared yet',
                videos: 'No videos shared yet',
                files: 'No files shared yet',
                links: 'No links shared yet'
            };
            return (
                <EmptyState 
                    icon={tabs.find(t => t.id === activeTab)?.icon || 'perm_media'}
                    title={emptyMessages[activeTab]}
                    description="Shared items will appear here"
                    variant="media"
                />
            );
        }

        if (activeTab === 'photos') {
            const allImages = [];
            media.forEach(msg => {
                const senderName = msg.display_name || msg.username;
                const senderAvatar = msg.avatar_url || msg.avatar_thumb_url;
                const isMe = msg.user_id === currentUser?.id;

                // [MODIFIED] Show all, but mark undownloaded
                const isDownloaded = isMe || downloadedIds.includes(String(msg.id));

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
                             messageId: msg.id,
                             isDownloaded // Pass status
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
                        messageId: msg.id,
                        isDownloaded // Pass status
                    });
                }
            });

            return (
                <div className="grid grid-cols-3 gap-1">
                    {allImages.map((img, idx) => (
                        <div 
                            key={`${img.id}-${idx}`}
                            className="relative aspect-square cursor-pointer overflow-hidden bg-slate-200 dark:bg-slate-700 hover:opacity-90 transition-opacity group"
                            onClick={(e) => {
                                if (img.isDownloaded) {
                                    setViewerIndex(idx);
                                    setViewerOpen(true);
                                } else {
                                    handleDownload(e, img.messageId);
                                }
                            }}
                        >
                            {img.isDownloaded ? (
                                <img 
                                    src={img.url} 
                                    alt="Shared" 
                                    className="w-full h-full object-cover" 
                                    loading="lazy" 
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600">
                                    <span className="material-symbols-outlined text-[32px]">image</span>
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-all">
                                        <span className="material-symbols-outlined text-transparent group-hover:text-white/80 transform translate-y-2 group-hover:translate-y-0 transition-all">download</span>
                                    </div>
                                </div>
                            )}
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
                    {media.map(msg => {
                        const isMe = msg.user_id === currentUser?.id;
                        const isDownloaded = isMe || downloadedIds.includes(String(msg.id));
                        const url = msg.gif_url || (msg.content && msg.content.match(/https?:\/\/\S+\.mp4/)?.[0]);

                        return (
                         <div key={msg.id} className="flex gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors"
                              onClick={(e) => {
                                  if (!isDownloaded) {
                                      handleDownload(e, msg.id);
                                  } else if (url) {
                                      window.open(url, '_blank');
                                  }
                              }}
                         >
                              <div className="w-16 h-16 bg-black/10 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative group">
                                   {isDownloaded && (msg.preview_url || msg.image_url) ? (
                                       <img src={msg.preview_url || msg.image_url} className="w-full h-full object-cover" />
                                   ) : (
                                       <div className="flex items-center justify-center w-full h-full bg-slate-200 dark:bg-slate-700">
                                           <span className="material-symbols-outlined text-slate-400">
                                               {isDownloaded ? 'play_circle' : 'videocam'}
                                           </span>
                                       </div>
                                   )}
                                   <div className={`absolute inset-0 flex items-center justify-center ${!isDownloaded ? 'bg-black/0 group-hover:bg-black/10' : 'bg-black/20'} transition-all`}>
                                       <span className="material-symbols-outlined text-white text-[20px]">
                                           {isDownloaded ? 'play_arrow' : 'download'}
                                       </span>
                                   </div>
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col justify-center">
                                  <p className={`text-sm ${isDownloaded ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'} truncate font-medium`}>
                                      {isDownloaded ? (msg.type === 'gif' ? 'GIF' : 'Video') : 'Video'}
                                  </p>
                                  <p className="text-xs text-slate-400 dark:text-slate-500">
                                      {new Date(msg.created_at).toLocaleDateString()}
                                  </p>
                              </div>
                         </div>
                     );
                    })}
                </div>
            );
       }

       if (activeTab === 'files') {
           return (
               <div className="space-y-2">
                   {media.map(msg => {
                       const isMe = msg.user_id === currentUser?.id;
                       const isDownloaded = isMe || downloadedIds.includes(String(msg.id));
                       const isDownloading = downloadingIds.includes(String(msg.id));
                       
                       // Check if browser compatible
                       const ext = (msg.file_name || "").split('.').pop().toLowerCase();
                       const isOpenable = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mp3', 'wav', 'txt'].includes(ext);

                       return (
                       <div key={msg.id} className="relative group flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors"
                            onClick={(e) => {
                                if (isDownloading) return;
                                if (!isDownloaded) {
                                    handleFakeDownload(e, msg.id);
                                } else if (msg.file_url) {
                                    window.open(msg.file_url, '_blank');
                                }
                            }}
                       >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isDownloaded ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                                {isDownloading ? (
                                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span className="material-symbols-outlined">
                                        {isDownloaded ? 'description' : 'download'}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                 <p className="text-xs text-slate-400 dark:text-slate-500">
                                     {new Date(msg.created_at).toLocaleDateString()} • {msg.display_name}
                                 </p>
                                 <p className={`text-sm font-medium ${isDownloaded ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'} truncate`}>
                                     {msg.file_name || msg.content || 'Untitled File'}
                                 </p>
                            </div>

                            {/* Actions Right Side */}
                            <div className="flex items-center gap-2 shrink-0">
                                {isDownloaded && isOpenable && (
                                    <button 
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            // window.open(msg.file_url, '_blank'); // Triggers download if headers force it
                                            
                                            // Try to fetch as blob to force open in new tab
                                            try {
                                                const win = window.open('', '_blank'); // Open immediately to avoid popup blocker
                                                if (win) {
                                                    win.document.write('Loading...');
                                                }
                                                
                                                const response = await fetch(msg.file_url);
                                                const blob = await response.blob();
                                                const objectUrl = URL.createObjectURL(blob);
                                                
                                                if (win) {
                                                    win.location.href = objectUrl;
                                                } else {
                                                    window.open(objectUrl, '_blank');
                                                }
                                                
                                                // Clean up after a delay
                                                setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
                                            } catch (err) {
                                                console.error("Failed to open file blob:", err);
                                                // Fallback
                                                window.open(msg.file_url, '_blank');
                                            }
                                        }}
                                        className="text-[10px] font-bold text-white bg-violet-600 hover:bg-violet-700 active:bg-violet-800 px-2 py-1 rounded-md uppercase tracking-wider transition-colors shadow-sm"
                                    >
                                        Open
                                    </button>
                                )}
                                <button
                                   onClick={(e) => {
                                       e.stopPropagation();
                                       onGoToMessage(msg.id);
                                   }}
                                   className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-700 rounded-full shadow-sm border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-all hover:text-violet-600 dark:hover:text-violet-400"
                                   title="Go to message"
                                >
                                   <span className="material-symbols-outlined text-[18px]">arrow_outward</span>
                                </button>
                            </div>
                       </div>
                   );
                   })}
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

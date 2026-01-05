
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import AudioPlayer from './AudioPlayer'; // Reusing existing player for icon/duration? Or just simplify.
// Requirements say: "Audio Icon + duration (NO playback)"

const formatTime = (dateString) => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        // Format: "10:45 AM"
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '-';
    }
};

const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Helper for approximate time
const formatReadTime = (dateString, isApproximate) => {
    const time = formatTime(dateString);
    if (time === '-') return '-';
    return isApproximate ? `${time}` : time;
};

const MessagePreview = ({ msg }) => {
    if (!msg) return null;

    if (msg.type === 'image') {
        if (msg.is_view_once) {
             return (
                <div className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                    <div className="w-6 h-6 rounded-full border-2 border-slate-500 dark:border-slate-400 flex items-center justify-center">
                        <span className="text-[10px] font-bold">1</span>
                    </div>
                    <span className="font-medium">Photo</span>
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-2">
                <div className="flex justify-center p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <img 
                        src={msg.media_url} 
                        alt="Preview" 
                        className="max-h-32 object-contain rounded-md" 
                    />
                </div>
                {msg.caption && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 italic px-1 line-clamp-2">
                        {renderTextWithEmojis(msg.caption)}
                    </p>
                )}
            </div>
        );
    }
    if (msg.type === 'gif') {
        return (
             <div className="flex flex-col gap-2">
                <div className="flex justify-center p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <img 
                        src={msg.media_url} 
                        alt="GIF" 
                        className="max-h-32 object-contain rounded-md" 
                    />
                </div>
                {msg.content !== 'GIF' && (
                     <p className="text-sm text-slate-600 dark:text-slate-300 italic px-1 line-clamp-2">
                        {renderTextWithEmojis(msg.content)}
                    </p>
                )}
            </div>
        );
    }

    if (msg.type === 'audio') {
        return (
            <div className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                <span className="material-symbols-outlined text-[24px]">mic</span>
                <div className="flex flex-col">
                    <span className="font-medium">Voice message</span>
                    <span className="text-xs opacity-70">{formatDuration(msg.audio_duration_ms)}</span>
                </div>
            </div>
        );
    }

    if (msg.type === 'file') {
        return (
             <div className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                <span className="material-symbols-outlined text-[24px]">description</span>
                <div className="flex flex-col min-w-0">
                    <span className="font-medium break-all line-clamp-1">{msg.file_name || 'File'}</span>
                    <span className="text-xs opacity-70">Document</span>
                </div>
            </div>
        );
    }

    if (msg.type === 'poll') {
         return (
             <div className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                <span className="material-symbols-outlined text-[24px]">poll</span>
                <div className="flex flex-col">
                    <span className="font-medium break-all line-clamp-2">{msg.content || 'Poll'}</span>
                </div>
            </div>
        );
    }

    if (msg.type === 'location') {
         return (
             <div className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                <span className="material-symbols-outlined text-[24px]">location_on</span>
                <div className="flex flex-col">
                    <span className="font-medium break-all line-clamp-2">{msg.content || 'Location'}</span>
                </div>
            </div>
        );
    }

    // Default Text
    return (
        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap break-words max-h-32 overflow-y-auto custom-scrollbar">
            {renderTextWithEmojis(msg.content)}
        </div>
    );
};



// Helper Component for a User Row
const UserRow = ({ user, statusTime, statusLabel }) => (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
            {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold">
                    {user.name?.[0]?.toUpperCase()}
                </div>
            )}
        </div>
        <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {renderTextWithEmojis(user.name)}
            </div>
        </div>
        <div className="flex flex-col items-end">
            {statusTime && (
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {statusTime}
                </span>
            )}
            {statusLabel && (
                <span className="text-[9px] text-slate-400 dark:text-slate-500 lowercase">
                    {statusLabel}
                </span>
            )}
        </div>
    </div>
);

const Section = ({ title, icon, users, emptyText, showApproximate = false, hideTime = false }) => (
    <div className="p-2">
        <div className="px-4 py-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</h3>
            {icon}
        </div>
        {(!users || users.length === 0) ? (
            <div className="px-4 py-3 text-center text-sm text-slate-400 italic">
                {emptyText}
            </div>
        ) : (
            <div className="flex flex-col">
                {users.map(user => (
                    <UserRow 
                        key={user.userId} 
                        user={user} 
                        statusTime={hideTime ? null : formatReadTime(user.at, user.approximate)}
                        statusLabel={user.approximate ? '(approx)' : null}
                    />
                ))}
            </div>
        )}
    </div>
);

export default function MessageInfoModal({ messageId, onClose }) {
    const { token } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!messageId) return;
        setLoading(true);
        fetch(`${import.meta.env.VITE_API_URL}/api/messages/${messageId}/info`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(async res => {
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to fetch info');
            }
            return res.json();
        })
        .then(setData)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }, [messageId, token]);

    if (!messageId) return null;

    return (
        <div 
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                        <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">arrow_back</span>
                    </button>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Message Info</h2>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3">
                        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm text-slate-500">Loading details...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-500 px-6 text-center">
                        <span className="material-symbols-outlined text-[32px]">error</span>
                        <span className="text-sm font-medium">{error}</span>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {/* Preview Section */}
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                             <MessagePreview msg={data.message} />
                             <div className="mt-2 flex flex-col gap-1">
                                 <div className="text-xs text-slate-400 dark:text-slate-500 flex justify-end gap-1">
                                    <span>Sent:</span>
                                    <span className="font-mono text-slate-600 dark:text-slate-300">
                                        {formatTime(data.message.created_at)}
                                    </span>
                                 </div>
                             </div>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {(() => {
                                const { message, interactions, delivered, pending } = data;
                                const { read = [], played = [], opened = [] } = interactions || {};
                                
                                // [NEW] Calculate Effective Delivered and Pending lists
                                // If a user has Read/Played/Opened, they implicitly have the message Delivered.
                                // This fixes issues where legacy messages or race conditions result in no delivery record.
                                
                                const effectiveDelivered = [...delivered];
                                const deliveredIds = new Set(delivered.map(u => u.userId));

                                // Add anyone who interacted but isn't in delivered
                                [read, played, opened].forEach(list => {
                                    list?.forEach(u => {
                                        if (!deliveredIds.has(u.userId)) {
                                            effectiveDelivered.push(u); // Use interaction time as proxy
                                            deliveredIds.add(u.userId);
                                        }
                                    });
                                });

                                // Filter pending: Remove anyone who is now in effectiveDelivered
                                const effectivePending = pending.filter(u => !deliveredIds.has(u.userId));

                                const renderPending = () => effectivePending && effectivePending.length > 0 && (
                                    <div className="pb-6">
                                        <Section 
                                            title="Sent to" 
                                            icon={<span className="material-symbols-outlined text-[18px] text-slate-400">check</span>}
                                            users={effectivePending} 
                                            emptyText="Sent"
                                            hideTime={true}
                                        />
                                    </div>
                                );
                                
                                // Logic for Voice Messages: Played, Seen, Delivered
                                if (message.type === 'audio') {
                                    // Seen: SHOW ALL (No disjoint)
                                    // Delivered: SHOW ALL (No disjoint)

                                    return (
                                        <>
                                            <Section 
                                                title="Played" 
                                                icon={<span className="material-symbols-outlined text-[18px] text-blue-500 filled">play_circle</span>}
                                                users={played} 
                                                emptyText="Not played yet"
                                            />
                                            {read.length > 0 && (
                                                <Section 
                                                    title="Seen" 
                                                    icon={<span className="material-symbols-outlined text-[18px] text-blue-500 filled">done_all</span>}
                                                    users={read} 
                                                    emptyText="Not seen yet"
                                                />
                                            )}
                                            {effectiveDelivered.length > 0 && (
                                                <Section 
                                                    title="Delivered to" 
                                                    icon={<span className="material-symbols-outlined text-[18px] text-slate-400">done_all</span>}
                                                    users={effectiveDelivered} 
                                                    emptyText="Delivered"
                                                />
                                            )}
                                            {renderPending()}
                                        </>
                                    );
                                }

                                // Logic for View Once: Opened, Seen, Delivered
                                if (message.is_view_once) {
                                    // Seen: SHOW ALL (No disjoint)
                                    // Delivered: SHOW ALL

                                    return (
                                        <>
                                            <Section 
                                                title="Opened" 
                                                icon={<div className="w-5 h-5 rounded-full border-2 border-dashed border-slate-400 flex items-center justify-center"><div className="w-3 h-3 rounded-full bg-transparent"></div></div>}
                                                users={opened} 
                                                emptyText="Not opened yet"
                                            />
                                            {read.length > 0 && (
                                                <Section 
                                                    title="Seen" 
                                                    icon={<span className="material-symbols-outlined text-[18px] text-blue-500 filled">done_all</span>}
                                                    users={read} 
                                                    emptyText="Not seen yet"
                                                />
                                            )}
                                            {effectiveDelivered.length > 0 && (
                                                <Section 
                                                    title="Delivered to" 
                                                    icon={<span className="material-symbols-outlined text-[18px] text-slate-400">done_all</span>}
                                                    users={effectiveDelivered} 
                                                    emptyText="Delivered"
                                                />
                                            )}
                                            {renderPending()}
                                        </>
                                    );
                                }

                                // Logic for Others (Text, Image, etc.): Read, Delivered
                                return (
                                    <>
                                        <Section 
                                            title="Read by" 
                                            icon={<span className="material-symbols-outlined text-[18px] text-blue-500 filled">done_all</span>}
                                            users={read} 
                                            emptyText="Not read yet"
                                        />
                                        {effectiveDelivered.length > 0 && (
                                            <Section 
                                                title="Delivered to" 
                                                icon={<span className="material-symbols-outlined text-[18px] text-slate-400">done_all</span>}
                                                users={effectiveDelivered} 
                                                emptyText="Delivered"
                                            />
                                        )}
                                        {renderPending()}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

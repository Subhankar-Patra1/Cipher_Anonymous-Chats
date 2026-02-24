import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { useTheme } from '../context/ThemeContext';
import { format, isToday, isYesterday } from 'date-fns';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

// [NEW] Format duration seconds to human-readable
const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
};

export default function CallHistory({ onSelectCall, activeFilter }) {
    const { user } = useAuth();
    const { initiateCall } = useCall();
    const { theme } = useTheme();
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    
    const [calls, setCalls] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, call: null });
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const fetchCalls = useCallback(async (pageNum = 1) => {
        try {
            const res = await fetch(`${API_URL}/api/calls?page=${pageNum}&limit=20`, {
                headers: {
                    'Authorization': `Bearer ${user.token || localStorage.getItem('token')}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (pageNum === 1) {
                    setCalls(data);
                } else {
                    setCalls(prev => [...prev, ...data]);
                }
                setHasMore(data.length === 20);
            } else {
                console.error("Failed to fetch calls");
            }
        } catch (err) {
            console.error("Error fetching calls:", err);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL, user]);

    useEffect(() => {
        fetchCalls(1);
    }, [fetchCalls]);

    // [NEW] Real-time: Listen for call end events to refresh
    useEffect(() => {
        const handleCallEnded = () => {
            // Small delay to let the server save
            setTimeout(() => fetchCalls(1), 1000);
        };
        window.addEventListener('cipher:call-log-saved', handleCallEnded);
        return () => window.removeEventListener('cipher:call-log-saved', handleCallEnded);
    }, [fetchCalls]);

    const handleScroll = (e) => {
        const { scrollHeight, scrollTop, clientHeight } = e.target;
        if (scrollHeight - scrollTop - clientHeight < 50 && hasMore && !isLoading) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchCalls(nextPage);
        }
    };

    const handleCallClick = (call) => {
        const isCaller = call.caller_id === user.id;
        const otherUser = isCaller ? {
            id: call.receiver_id,
            display_name: call.receiver_name,
            username: call.receiver_username,
            avatar_thumb_url: call.receiver_avatar
        } : {
            id: call.caller_id,
            display_name: call.caller_name,
            username: call.caller_username,
            avatar_thumb_url: call.caller_avatar
        };
        initiateCall(otherUser.id, call.room_id, call.type, otherUser.display_name, otherUser.avatar_thumb_url);
    };

    // [NEW] Delete a single call
    const handleDeleteCall = async (callId) => {
        try {
            const res = await fetch(`${API_URL}/api/calls/${callId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (res.ok) {
                setCalls(prev => prev.filter(c => c.id !== callId));
            }
        } catch (err) {
            console.error("Error deleting call:", err);
        }
        setContextMenu({ visible: false, x: 0, y: 0, call: null });
    };

    // [NEW] Clear all call history
    const handleClearAll = async () => {
        try {
            const res = await fetch(`${API_URL}/api/calls`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (res.ok) {
                setCalls([]);
            }
        } catch (err) {
            console.error("Error clearing calls:", err);
        }
        setShowClearConfirm(false);
    };

    // [NEW] Context menu on right-click
    const handleContextMenu = (e, call) => {
        e.preventDefault();
        const menuWidth = 180;
        const menuHeight = 100;
        let x = e.clientX;
        let y = e.clientY;
        // Prevent menu from overflowing right edge
        if (x + menuWidth > window.innerWidth) {
            x = window.innerWidth - menuWidth - 8;
        }
        // Prevent menu from overflowing bottom edge
        if (y + menuHeight > window.innerHeight) {
            y = window.innerHeight - menuHeight - 8;
        }
        setContextMenu({ visible: true, x, y, call });
    };

    // Close context menu on click anywhere
    useEffect(() => {
        const close = () => setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    const renderDateHeader = (date) => {
        if (isToday(new Date(date))) return 'Today';
        if (isYesterday(new Date(date))) return 'Yesterday';
        return format(new Date(date), 'MMMM d, yyyy');
    };

    // [NEW] Get status label and color
    const getCallInfo = (call) => {
        const isCaller = call.caller_id === user.id;
        const isMissed = call.status === 'missed';
        const isDeclined = call.status === 'declined';
        const isCancelled = call.status === 'cancelled';
        const isBusy = call.status === 'busy';
        const isCompleted = call.status === 'completed';
        
        let statusLabel = '';
        let statusColor = 'text-slate-500 dark:text-slate-400';
        
        if (isMissed) {
            statusLabel = isCaller ? 'No answer' : 'Missed';
            statusColor = 'text-red-600 dark:text-red-400';
        } else if (isDeclined) {
            statusLabel = isCaller ? 'Declined' : 'Declined';
            statusColor = 'text-red-500 dark:text-red-400';
        } else if (isCancelled) {
            statusLabel = 'Cancelled';
            statusColor = 'text-orange-500 dark:text-orange-400';
        } else if (isBusy) {
            statusLabel = 'Busy';
            statusColor = 'text-orange-500 dark:text-orange-400';
        } else if (isCompleted) {
            statusLabel = isCaller ? 'Outgoing' : 'Incoming';
        } else {
            statusLabel = isCaller ? 'Outgoing' : 'Incoming';
        }
        
        return { statusLabel, statusColor, isCaller, isMissed: isMissed || isDeclined };
    };

    // Group calls by date
    const groupedCalls = calls.reduce((groups, call) => {
        // [FIX] Use local date instead of UTC date from ISO string
        const date = format(new Date(call.started_at), 'yyyy-MM-dd');
        if (!groups[date]) groups[date] = [];
        groups[date].push(call);
        return groups;
    }, {});

    return (
        <div className="w-full h-full flex flex-col bg-white dark:bg-[#1D1D21]">
            {/* [NEW] Clear All button in a compact toolbar */}
            {calls.length > 0 && (
                <div className="shrink-0 px-4 md:px-6 py-2 flex justify-end border-b border-slate-100 dark:border-[#232326]">
                    <button 
                        onClick={() => setShowClearConfirm(true)}
                        className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors flex items-center gap-1"
                    >
                        <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                        Clear All
                    </button>
                </div>
            )}

            <div className={`flex-1 ${calls.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'}`} onScroll={handleScroll}>
                {isLoading && calls.length === 0 ? (
                    <div className="flex justify-center items-center h-40">
                        <span className="material-symbols-outlined animate-spin text-2xl text-violet-500">progress_activity</span>
                    </div>
                ) : calls.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-500 gap-3 pb-20">
                        <span className="material-symbols-outlined text-5xl opacity-60">call_log</span>
                        <p>No recent calls</p>
                    </div>
                ) : (
                    Object.keys(groupedCalls).map(date => (
                        <div key={date}>
                            <div className="sticky top-0 z-10 px-4 md:px-6 py-2 bg-slate-100/90 dark:bg-[#232326]/90 backdrop-blur-sm text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                {renderDateHeader(date)}
                            </div>
                            <div> 
                                {groupedCalls[date].map(call => {
                                    const { statusLabel, statusColor, isCaller, isMissed } = getCallInfo(call);
                                    const isVideo = call.type === 'video';
                                    const otherUser = isCaller ? {
                                        name: call.receiver_name || call.receiver_username || 'Unknown',
                                        avatar: call.receiver_avatar
                                    } : {
                                        name: call.caller_name || call.caller_username || 'Unknown',
                                        avatar: call.caller_avatar
                                    };
                                    const duration = formatDuration(call.duration);

                                    const isActive = contextMenu.visible && contextMenu.call?.id === call.id;

                                    return (
                                        <div 
                                            key={call.id} 
                                            className={`group flex items-center p-3 rounded-md transition-all cursor-pointer gap-3 mx-1 my-0.5 ${
                                                isActive 
                                                ? 'bg-violet-50 dark:bg-violet-500/10 ring-inset ring-1 ring-violet-500/20 dark:ring-violet-500/30' 
                                                : 'hover:bg-slate-100 dark:hover:bg-[#2A2A2D]'
                                            }`}
                                            onContextMenu={(e) => handleContextMenu(e, call)}
                                        >
                                            {/* Avatar */}
                                            <div className="relative shrink-0">
                                                {otherUser.avatar ? (
                                                    <img src={otherUser.avatar} alt={otherUser.name} className="w-12 h-12 rounded-full object-cover bg-slate-200 dark:bg-slate-700" />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-lg">
                                                        {otherUser.name[0]?.toUpperCase()}
                                                    </div>
                                                )}
                                                {/* Status Icon Overlay */}
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-[#1D1D21] flex items-center justify-center shadow-md">
                                                    {isMissed ? (
                                                        <span className="material-symbols-outlined text-[14px] text-red-600 font-bold">call_missed</span>
                                                    ) : isCaller ? (
                                                        <span className="material-symbols-outlined text-[14px] text-green-600 font-bold">call_made</span>
                                                    ) : (
                                                        <span className="material-symbols-outlined text-[14px] text-green-600 font-bold">call_received</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                <div className={`font-medium ${isMissed ? 'text-red-500 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'} truncate`}>
                                                    {renderTextWithEmojis(otherUser.name, '1.2em', '-0.2em')}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[14px] opacity-80">
                                                        {isVideo ? 'videocam' : 'call'}
                                                    </span>
                                                    <span className={statusColor}>{statusLabel}</span>
                                                    <span className="opacity-40">·</span>
                                                    <span>{format(new Date(call.started_at), 'h:mm a')}</span>
                                                    {duration && (
                                                        <>
                                                            <span className="opacity-40">·</span>
                                                            <span>{duration}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Call Again Button (Hover) */}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleCallClick(call); }}
                                                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 dark:hover:text-green-400 transition-all opacity-40 group-hover:opacity-100 focus:opacity-100"
                                                title={`Call ${otherUser.name}`}
                                            >
                                                <span className="material-symbols-outlined text-2xl">
                                                    {isVideo ? 'videocam' : 'call'}
                                                </span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* [NEW] Context Menu */}
            {contextMenu.visible && (
                <div 
                    className="fixed z-[99999] bg-white dark:bg-[#2A2A2D] rounded-lg shadow-2xl py-1.5 min-w-[180px] whitespace-nowrap"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        onClick={() => { handleCallClick(contextMenu.call); setContextMenu({ visible: false, x: 0, y: 0, call: null }); }}
                        className="w-[calc(100%-8px)] mx-1 text-left px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#363639] rounded-md flex items-center gap-2.5 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px] text-green-500">call</span>
                        Call again
                    </button>
                    <button 
                        onClick={() => handleDeleteCall(contextMenu.call.id)}
                        className="w-[calc(100%-8px)] mx-1 text-left px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md flex items-center gap-2.5 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                        Delete
                    </button>
                </div>
            )}

            {/* [NEW] Clear All Confirmation Modal */}
            {showClearConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#2A2A2D] rounded-2xl shadow-2xl p-6 w-80 border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Clear Call History</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
                            Are you sure you want to delete all call logs? This cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowClearConfirm(false)}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleClearAll}
                                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
                            >
                                Clear All
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

const GroupInviteMessage = ({ msg, isMe, token }) => {
    const [inviteData, setInviteData] = useState(() => {
        try { return JSON.parse(msg.content); } catch(e) { return {}; }
    });
    const [loading, setLoading] = useState(false);
    const [joined, setJoined] = useState(false); // [RESTORED]
    const [verifying, setVerifying] = useState(true); // [NEW]
    const [expired, setExpired] = useState(false); 
    const [error, setError] = useState(null);

    // Fetch latest group info on mount
    useEffect(() => {
        if (!inviteData.group_code) {
             setVerifying(false);
             return;
        }

        let isMounted = true;
        const fetchGroupInfo = async () => {
             try {
                 const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/preview/${inviteData.group_code}`, {
                     headers: { Authorization: `Bearer ${token}` }
                 });
                 
                 if (res.status === 410) { 
                     if (isMounted) setExpired(true);
                     return;
                 }
                 
                 if (res.ok && isMounted) {
                     const data = await res.json();
                     setInviteData(prev => ({
                         ...prev,
                         group_name: data.name,
                         group_avatar: data.avatar_url,
                         member_count: data.member_count,
                         expires_at: data.expires_at
                     }));
                     
                     if (data.is_member) setJoined(true);
                     
                     // Check expiry locally too
                     if (data.expires_at && new Date(data.expires_at) < new Date()) {
                         setExpired(true);
                     }
                 }
             } catch (err) {
                 console.error("Failed to fetch group info", err);
             } finally {
                 if (isMounted) setVerifying(false);
             }
        };
        
        fetchGroupInfo();
        
        return () => { isMounted = false; };
    }, [inviteData.group_code, token]);

    const handleJoin = async (e) => {
        e.stopPropagation();
        
        if (expired) {
            setError('Link Expired');
            setTimeout(() => setError(null), 3000);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ code: inviteData.group_code })
            });
            const data = await res.json();
            
            if (res.status === 410 || res.status === 400 && (data.error || '').includes('expired')) {
                setExpired(true);
                setError('Link Expired');
                setTimeout(() => setError(null), 3000);
            } else if (res.ok || data.message === 'Already joined') {
                setJoined(true);
            } else {
                setError(data.error || 'Failed');
                setTimeout(() => setError(null), 2000);
            }
        } catch (err) {
            setError('Failed');
            setTimeout(() => setError(null), 2000);
        } finally {
            setLoading(false);
        }
    };

    const cardBg = isMe 
        ? 'bg-violet-600' 
        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm';
        
    const textColor = isMe ? 'text-white' : 'text-slate-900 dark:text-white';
    const subTextColor = isMe ? 'text-violet-200' : 'text-slate-500 dark:text-slate-400';

    return (
        <div className={`overflow-hidden rounded-2xl ${cardBg} max-w-[280px] ${expired ? 'opacity-75 grayscale' : ''}`}>
            {/* Header */}
            <div className={`px-4 py-2 flex items-center gap-2 ${isMe ? 'bg-black/10' : 'bg-slate-50 dark:bg-black/20'} border-b ${isMe ? 'border-white/10' : 'border-slate-100 dark:border-white/5'}`}>
                <span className={`material-symbols-outlined text-[16px] ${isMe ? 'text-white/90' : 'text-violet-600 dark:text-violet-400'}`}>
                    diversity_3
                </span>
                <span className={`text-xs font-bold uppercase tracking-wider ${isMe ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'}`}>
                    Group Invitation
                </span>
            </div>
            
            {/* Body */}
            <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                    {/* Avatar */}
                    {inviteData.group_avatar ? (
                        <img 
                            src={inviteData.group_avatar} 
                            alt={inviteData.group_name} 
                            className="w-12 h-12 shrink-0 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700"
                        />
                    ) : (
                        <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-xl font-bold shadow-sm ${isMe ? 'bg-white/20 text-white' : 'bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white'}`}>
                            {inviteData.group_name?.[0]?.toUpperCase() || 'G'}
                        </div>
                    )}
                    
                    <div className="min-w-0 flex-1">
                        <h3 className={`font-bold text-base leading-tight truncate ${textColor}`}>
                            {inviteData.group_name || 'Group Name'}
                        </h3>
                        <p className={`text-xs ${subTextColor} mt-0.5 truncate`}>
                            {isMe 
                                ? 'You sent an invitation' 
                                : <>Invited by <span className="font-medium">{renderTextWithEmojis(inviteData.inviter_name || '')}</span></>
                            }
                        </p>
                        {expired ? (
                             <p className="text-[10px] text-red-500 dark:text-red-400 font-bold mt-1">
                                 Expired
                             </p>
                        ) : inviteData.member_count !== undefined && (
                            <p className={`text-[10px] ${subTextColor} mt-0.5 opacity-80`}>
                                {inviteData.member_count} members
                            </p>
                        )}
                    </div>
                </div>
                
                {/* Action Button */}
                {!isMe && (
                    <button
                        onClick={handleJoin}
                        disabled={loading || joined || verifying || (expired && error !== 'Link Expired')} 
                        className={`w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2
                            ${joined 
                                ? 'bg-emerald-500 text-white cursor-default'
                                : verifying 
                                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-wait'
                                    : expired 
                                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                        : error 
                                            ? 'bg-red-500 text-white'
                                            : 'bg-violet-600 hover:bg-violet-700 active:scale-95 text-white shadow-violet-500/20'
                            }
                            ${(loading) ? 'opacity-70 cursor-wait' : ''}
                        `}
                    >
                        {joined ? (
                            <>
                                <span className="material-symbols-outlined text-[18px]">check</span>
                                Joined
                            </>
                        ) : verifying ? (
                            <span className="text-xs">Checking status...</span>
                        ) : expired ? (
                            error === 'Link Expired' ? (
                                <span className="text-xs">Ask for new link</span> 
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">timer_off</span>
                                    Link Expired
                                </>
                            )
                        ) : error ? (
                            error
                        ) : loading ? (
                            'Joining...'
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">login</span>
                                Join Group
                            </>
                        )}
                    </button>
                )}
                {isMe && (
                    <div className="w-full py-2 rounded-xl bg-black/20 text-white/80 text-xs font-medium text-center">
                        {expired ? 'Invitation Expired' : 'Invitation Sent'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GroupInviteMessage;

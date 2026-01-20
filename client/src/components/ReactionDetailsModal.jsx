import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Emoji, EmojiStyle } from 'emoji-picker-react';
import { REACTION_MAP } from './ReactionPicker';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

const getUnifiedFromEmoji = (emoji) => {
    if (REACTION_MAP[emoji]) return REACTION_MAP[emoji];
    try {
        if (!emoji) return null;
        let unified = "";
        for (const char of emoji) {
            const hex = char.codePointAt(0).toString(16);
            if (hex === "fe0f") continue; 
            if (unified) unified += "-";
            unified += hex;
        }
        return unified;
    } catch (e) {
        return null;
    }
};

const ReactionDetailsModal = ({ reactions, anchorRect, onClose, onRemoveReaction }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('all');
    const [isClosing, setIsClosing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, origin: 'center', isTop: true });

    // Trigger opening animation after mount
    useLayoutEffect(() => {
        // Small delay to ensure CSS transition works
        const timer = setTimeout(() => setIsOpen(true), 10);
        return () => clearTimeout(timer);
    }, []);

    // Handle closing with animation
    const handleClose = () => {
        setIsClosing(true);
        setIsOpen(false);
        setTimeout(() => {
            onClose();
        }, 200); // Match transition duration
    };

    // Positioning logic
    useLayoutEffect(() => {
        if (!anchorRect || !menuRef.current) return;

        const menuWidth = 360;
        const menuHeight = Math.min(400, reactions.length * 56 + 58);
        const gap = 10;
        
        // Vertical Positioning
        let isTop = true;
        let top = anchorRect.top - menuHeight - gap;
        if (top < 10) {
            top = anchorRect.bottom + gap;
            isTop = false;
        }

        // Horizontal Positioning (Anchor Alignment with Shift)
        let left = anchorRect.left + 12;
        
        if (left + menuWidth > window.innerWidth - 10) {
            left = anchorRect.right - menuWidth - 12;
        }

        if (left < 10) left = 10;
        if (left + menuWidth > window.innerWidth - 10) {
            left = window.innerWidth - menuWidth - 10;
        }

        // Calculate PRECISE pixel-based transform-origin relative to the bubble's center
        // The origin should be exactly where the reaction bubble is, relative to the menu
        const bubbleCenterX = anchorRect.left + (anchorRect.width / 2);
        
        // Calculate horizontal origin: distance from menu's left edge to bubble center
        const originX = bubbleCenterX - left;
        
        // Calculate vertical origin: if menu is above bubble, origin is at bottom; if below, origin is at top
        const originY = isTop ? menuHeight : 0;
        
        const origin = `${originX}px ${originY}px`;

        setCoords({ top, left, origin, isTop });
    }, [anchorRect, reactions.length]);

    const tabs = useMemo(() => {
        const groups = reactions.reduce((acc, r) => {
            if (!acc[r.reaction]) acc[r.reaction] = 0;
            acc[r.reaction]++;
            return acc;
        }, {});
        
        const sortedEmojiTabs = Object.entries(groups)
            .sort((a, b) => b[1] - a[1]) 
            .map(([emoji, count]) => ({
                id: emoji,
                emoji,
                count
            }));

        return [
            { id: 'all', label: 'All', count: reactions.length },
            ...sortedEmojiTabs
        ];
    }, [reactions]);

    useMemo(() => {
        if (activeTab !== 'all' && !tabs.find(t => t.id === activeTab)) {
            setActiveTab('all');
        }
    }, [tabs, activeTab]);

    const filteredReactions = useMemo(() => {
        let list = reactions;
        if (activeTab !== 'all') {
            list = reactions.filter(r => r.reaction === activeTab);
        }
        return [...list].sort((a, b) => {
            const isMeA = parseInt(a.userId) === parseInt(user?.id);
            const isMeB = parseInt(b.userId) === parseInt(user?.id);
            if (isMeA) return -1;
            if (isMeB) return 1;
            return (a.display_name || '').localeCompare(b.display_name || '');
        });
    }, [reactions, activeTab, user]);

    return (
        <div 
            className={`fixed inset-0 z-[11000] transition-opacity duration-500 ${isClosing ? 'opacity-0' : 'opacity-100'}`} 
            onClick={handleClose}
        >
            <div 
                ref={menuRef}
                style={{ 
                    position: 'fixed',
                    top: coords.top,
                    left: coords.left,
                    width: '360px',
                    transformOrigin: coords.origin,
                    transform: isOpen ? 'scale(1)' : 'scale(0)',
                    opacity: isOpen ? 1 : 0,
                    transition: 'transform 0.2s ease-out, opacity 0.15s ease-out'
                }}
                className="bg-white dark:bg-[#1a1d21] rounded-[20px] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[400px]"
                onClick={e => e.stopPropagation()}
            >
                {/* Tabs Header */}
                <div className="flex border-b border-slate-100 dark:border-white/5 px-4 overflow-x-auto no-scrollbar scroll-smooth">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex items-center gap-2 px-3 py-3 text-sm font-bold transition-all relative shrink-0
                                ${activeTab === tab.id ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}
                            `}
                        >
                            <div className="flex items-center gap-2">
                                {tab.emoji ? (
                                    <Emoji unified={getUnifiedFromEmoji(tab.emoji)} size={18} emojiStyle={EmojiStyle.APPLE} />
                                ) : (
                                    <span>{tab.label}</span>
                                )}
                                <span className={`text-[14px] ${activeTab === tab.id ? 'opacity-100' : 'opacity-40 font-normal'}`}>{tab.count}</span>
                            </div>
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#10b981] rounded-t-full mx-2" />
                            )}
                        </button>
                    ))}
                </div>

                {/* List Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar-light dark:custom-scrollbar-dark py-1">
                    {filteredReactions.map((r, idx) => {
                        const isMe = parseInt(r.userId) === parseInt(user?.id);
                        return (
                            <div 
                                key={`${r.userId}-${r.reaction}-${idx}`} 
                                className="flex items-center gap-4 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                            >
                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border border-slate-200 dark:border-white/10">
                                    {r.avatar_thumb_url ? (
                                        <img src={r.avatar_thumb_url} alt={r.display_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-slate-500 dark:text-slate-400 font-bold text-sm">{(r.display_name || 'U')[0].toUpperCase()}</span>
                                    )}
                                </div>

                                {/* Name & Subtitle */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-[15px] text-slate-900 dark:text-white font-bold truncate">
                                        {isMe ? 'You' : renderTextWithEmojis(r.display_name, '16px')}
                                    </div>
                                    {isMe && (
                                        <button 
                                            onClick={() => {
                                                onRemoveReaction();
                                                onClose();
                                            }}
                                            className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors block mt-0.5"
                                        >
                                            Click to remove
                                        </button>
                                    )}
                                </div>

                                {/* Single Emoji display */}
                                <div className="shrink-0 flex items-center justify-center w-8 h-8">
                                    <Emoji unified={getUnifiedFromEmoji(r.reaction)} size={22} emojiStyle={EmojiStyle.APPLE} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ReactionDetailsModal;

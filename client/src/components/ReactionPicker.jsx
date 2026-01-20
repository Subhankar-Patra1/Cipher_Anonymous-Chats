import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../context/ThemeContext'; 
import EmojiPicker, { Emoji, EmojiStyle } from 'emoji-picker-react';

export const REACTION_MAP = {
    '👍': '1f44d',
    '❤️': '2764-fe0f',
    '😂': '1f602',
    '😮': '1f62e',
    '😢': '1f622',
    '🙏': '1f64f'
};

const REACTION_EMOJIS = Object.keys(REACTION_MAP);

export default function ReactionPicker({ onSelect, onRemove, onClose, currentReaction, className = '', origin = 'bottom-left', triggerRef }) {
    const { theme } = useTheme(); 
    const [showFullPicker, setShowFullPicker] = useState(false);
    const [isMenuClosing, setIsMenuClosing] = useState(false); 
    const [isClosing, setIsClosing] = useState(false); 
    const menuRef = useRef(null); 
    const buttonRef = useRef(null);
    const pickerRef = useRef(null);
    const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0, transformOrigin: 'center' });
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, autoOrigin: origin });

    // Calculate position for the main bar
    const updateMenuPosition = () => {
        if (triggerRef?.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const menuHeight = 44; 
            const menuWidth = 260; // Estimated width
            const screenHeight = window.innerHeight;
            const screenWidth = window.innerWidth;
            const gap = 8;

            let top = rect.top - menuHeight - gap;
            let isTop = true;

            // Horizontal position based on origin
            let left = origin.includes('right') 
                ? rect.right - menuWidth 
                : rect.left;

            // Flip to bottom if no space above
            if (top < 10 && rect.bottom + menuHeight + gap < screenHeight) {
                top = rect.bottom + gap;
                isTop = false;
            }

            // Horizontal clamp
            if (left < 10) left = 10;
            if (left + menuWidth > screenWidth) left = screenWidth - menuWidth - 10;

            const newOrigin = `${isTop ? 'bottom' : 'top'}-${origin.includes('right') ? 'right' : 'left'}`;
            setMenuPosition({ top, left, autoOrigin: newOrigin });
        }
    };

    // Initial position and change listeners for main bar
    useEffect(() => {
        updateMenuPosition();
        // Use capture phase for scroll to detect it correctly in the chat list
        window.addEventListener('scroll', updateMenuPosition, true);
        window.addEventListener('resize', updateMenuPosition);
        return () => {
            window.removeEventListener('scroll', updateMenuPosition, true);
            window.removeEventListener('resize', updateMenuPosition);
        };
    }, [triggerRef, origin]);

    // Calculate position for the full picker
    const updatePosition = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const pickerHeight = 402;
            const pickerWidth = 320;
            const screenHeight = window.innerHeight;
            const screenWidth = window.innerWidth;
            const gap = 6;

            let top = rect.bottom + gap;
            let left = rect.left - (pickerWidth / 2) + (rect.width / 2);

            // Vertical flip if not enough space below
            if (top + pickerHeight > screenHeight && rect.top > pickerHeight) {
                top = rect.top - pickerHeight - gap;
            }

            // Horizontal clamp
            if (left < 10) left = 10;
            if (left + pickerWidth > screenWidth) left = screenWidth - pickerWidth - 10;

            // Calculate Transform Origin relative to button center
            const buttonCenter = rect.left + (rect.width / 2);
            const relativeX = buttonCenter - left;
            // If opening UP (picker top < button top), origin is bottom. Else top.
            const isOpeningUp = top < rect.top;
            const transformOrigin = `${relativeX}px ${isOpeningUp ? 'bottom' : 'top'}`;

            setPickerPosition({ top, left, transformOrigin });
        }
    };

    // Initial position when opening full picker
    useEffect(() => {
        if (showFullPicker) {
            setIsClosing(false); 
            updatePosition();
        }
    }, [showFullPicker]);

    // Handle interactions for full picker (close on click outside, update pos on scroll)
    useEffect(() => {
        if (!showFullPicker) return;

        const handleEmojiClose = () => {
             setIsClosing(true);
        };

        const handleInteraction = (event) => {
            if (pickerRef.current && pickerRef.current.contains(event.target)) return;
            if (buttonRef.current && buttonRef.current.contains(event.target)) return;
            handleEmojiClose();
        };

        const handleScroll = (event) => {
            if (pickerRef.current && pickerRef.current.contains(event.target)) return;
            handleEmojiClose();
        };

        document.addEventListener('mousedown', handleInteraction);
        document.addEventListener('touchstart', handleInteraction);
        window.addEventListener('scroll', handleScroll, true); 
        window.addEventListener('resize', updatePosition);

        return () => {
            document.removeEventListener('mousedown', handleInteraction);
            document.removeEventListener('touchstart', handleInteraction);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [showFullPicker]);

    // Handle interaction for the main menu bar (close on click outside)
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showFullPicker) return;
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                // Also check if we clicked the trigger button to avoid immediate re-opening
                if (triggerRef?.current && triggerRef.current.contains(event.target)) return;
                handleMenuClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showFullPicker, triggerRef]); 

    const handleMenuClose = () => {
        setIsMenuClosing(true);
    };

    const handleSelectWithAnim = (emoji) => {
        onSelect(emoji);
        handleMenuClose();
    };

    const handleRemoveWithAnim = () => {
        onRemove();
        handleMenuClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] isolate pointer-events-none">
            {/* Main Reaction Bar */}
            <div 
                ref={menuRef}
                className={`
                    absolute pointer-events-auto
                    flex items-center gap-1 p-1 bg-white dark:bg-slate-800 rounded-full shadow-xl border border-slate-200 dark:border-slate-700 
                    ${isMenuClosing ? 'animate-menu-out' : 'animate-menu-in'}
                `}
                style={{ 
                    top: menuPosition.top, 
                    left: menuPosition.left,
                    transformOrigin: menuPosition.autoOrigin.replace('-', ' ') 
                }}
                onAnimationEnd={(e) => {
                    if (isMenuClosing && e.target === e.currentTarget) {
                        onClose?.();
                    }
                }}
            >
                {REACTION_EMOJIS.map(emojiChar => (
                    <button
                        key={emojiChar}
                        onClick={() => currentReaction === emojiChar ? handleRemoveWithAnim() : handleSelectWithAnim(emojiChar)}
                        className={`
                            w-8 h-8 flex items-center justify-center rounded-full transition-all text-xl
                            ${currentReaction === emojiChar 
                                ? 'bg-violet-100 dark:bg-violet-500/20 ring-1 ring-violet-500/30 dark:ring-violet-400/30' 
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700 hover:scale-110'
                            }
                        `}
                    >
                        <div className={currentReaction === emojiChar ? "scale-110 transition-transform duration-200" : ""}>
                            <Emoji 
                                unified={REACTION_MAP[emojiChar]} 
                                emojiStyle={EmojiStyle.APPLE} 
                                size={20} 
                            />
                        </div>
                    </button>
                ))}
                
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

                <div className="relative">
                    <button
                        ref={buttonRef}
                        onClick={() => {
                            if (!showFullPicker) {
                                updatePosition(); 
                                setShowFullPicker(true);
                                setIsClosing(false);
                            } else {
                                setIsClosing(true); 
                            }
                        }}
                        className={`
                            w-8 h-8 flex items-center justify-center rounded-full transition-all 
                            hover:bg-slate-100 dark:hover:bg-slate-700 hover:scale-110
                            ${showFullPicker ? 'bg-slate-100 dark:bg-slate-700' : ''}
                        `}
                        title="More reactions"
                    >
                        <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">add_circle</span>
                    </button>

                    {(showFullPicker || isClosing) && createPortal(
                        <div className="fixed inset-0 z-[10000] isolate pointer-events-none">
                            {/* Full Emoji Picker Container */}
                            <div 
                                ref={pickerRef}
                                className={`
                                    absolute pointer-events-auto 
                                    ${isClosing ? 'animate-shrink-out' : 'animate-grow-in'}
                                `}
                                style={{ 
                                    top: pickerPosition.top, 
                                    left: pickerPosition.left,
                                    transformOrigin: pickerPosition.transformOrigin
                                }}
                                onAnimationEnd={() => {
                                    if (isClosing) {
                                        setShowFullPicker(false);
                                        setIsClosing(false);
                                    }
                                }}
                            >
                                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                    <EmojiPicker 
                                        onEmojiClick={(emojiData) => {
                                            handleSelectWithAnim(emojiData.emoji);
                                            setIsClosing(true);
                                        }}
                                        emojiStyle={EmojiStyle.APPLE}
                                        theme={theme} 
                                        lazyLoadEmojis={true}
                                        searchDisabled={false}
                                        skinTonesDisabled
                                        width={320}
                                        height={400}
                                    />
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

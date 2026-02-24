import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker, { Emoji, EmojiStyle } from 'emoji-picker-react';
import { useTheme } from '../context/ThemeContext';

export const DEFAULT_REACTIONS = [
    { emoji: '👍', unified: '1f44d' },
    { emoji: '❤️', unified: '2764-fe0f' },
    { emoji: '😂', unified: '1f602' },
    { emoji: '😮', unified: '1f62e' },
    { emoji: '😢', unified: '1f622' },
    { emoji: '🙏', unified: '1f64f' }
];

export default function ReactionSettingsModal({ isOpen, onClose, onSave }) {
    const { theme } = useTheme();
    const [tempReactions, setTempReactions] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
    const modalRef = useRef(null);
    const itemRefs = useRef([]);

    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem('custom_reactions');
            if (saved) {
                setTempReactions(JSON.parse(saved));
            } else {
                setTempReactions([...DEFAULT_REACTIONS]);
            }
            setSelectedIndex(null);
            setShowPicker(false);
        }
    }, [isOpen]);

    const handleItemClick = (e, idx) => {
        e.stopPropagation(); // Prevent triggering the click-outside listener

        // If clicking the same emoji again, close the picker
        if (showPicker && selectedIndex === idx) {
            setShowPicker(false);
            setSelectedIndex(null);
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const pickerHeight = 320;
        const pickerWidth = 320;
        const viewportH = window.innerHeight;
        const viewportW = window.innerWidth;
        const gap = 20;

        let top = rect.bottom + gap;
        let left = rect.left + (rect.width / 2) - (pickerWidth / 2);

        // Flip up if not enough space below AND there is enough space above
        const spaceBelow = viewportH - rect.bottom;
        const spaceAbove = rect.top;

        if (spaceBelow < pickerHeight + gap && spaceAbove > spaceBelow) {
            top = rect.top - pickerHeight - gap;
        }

        // Clamp Vertical (Safety)
        if (top < 10) top = 10;
        if (top + pickerHeight > viewportH - 10) top = viewportH - pickerHeight - 10;

        // Clamp horizontal
        if (left < 10) left = 10;
        if (left + pickerWidth > viewportW - 10) left = viewportW - pickerWidth - 10;

        setPickerPos({ top, left });
        setSelectedIndex(idx);
        setShowPicker(true);
    };

    const handleEmojiClick = (emojiData) => {
        if (selectedIndex !== null) {
            const newReactions = [...tempReactions];
            newReactions[selectedIndex] = {
                emoji: emojiData.emoji,
                unified: emojiData.unified
            };
            setTempReactions(newReactions);
            setShowPicker(false);
            setSelectedIndex(null);
        }
    };

    // Close picker on click outside
    useEffect(() => {
        if (!showPicker) return;
        const handleClick = (e) => {
            if (showPicker && !e.target.closest('.epr-main')) {
                setShowPicker(false);
                setSelectedIndex(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showPicker]);

    const handleSave = () => {
        localStorage.setItem('custom_reactions', JSON.stringify(tempReactions));
        onSave(tempReactions);
        onClose();
    };

    const handleReset = () => {
        setTempReactions([...DEFAULT_REACTIONS]);
        setSelectedIndex(null);
        setShowPicker(false);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity"
                onClick={(e) => {
                    if (showPicker) {
                        setShowPicker(false);
                        setSelectedIndex(null);
                    } else {
                        onClose();
                    }
                }}
            />
            
            {/* Modal */}
            <div 
                ref={modalRef}
                className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-modal-scale"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-10">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                            Customize reactions
                        </h3>
                        <button 
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group"
                        >
                            <span className="material-symbols-outlined text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors text-[20px]">close</span>
                        </button>
                    </div>

                    {/* Reaction Bar Display */}
                    <div className="relative mb-10">
                        <div className="bg-slate-100 dark:bg-slate-800/50 p-3 rounded-full flex items-center justify-around shadow-inner">
                            {tempReactions.map((item, idx) => (
                                <button
                                    key={idx}
                                    onMouseDown={(e) => handleItemClick(e, idx)}
                                    className={`
                                        w-10 h-10 flex items-center justify-center rounded-full transition-all text-2xl
                                        ${selectedIndex === idx 
                                            ? 'z-20 scale-[1.6] animate-emoji-shake drop-shadow-[0_15px_15px_rgba(0,0,0,0.5)]' 
                                            : selectedIndex !== null
                                                ? 'opacity-30 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] scale-90 blur-[0.5px]'
                                                : 'hover:bg-white dark:hover:bg-slate-700 hover:scale-110'
                                        }
                                    `}
                                >
                                    <Emoji unified={item.unified} emojiStyle={EmojiStyle.APPLE} size={28} />
                                </button>
                            ))}
                        </div>
                        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
                            Click to replace an emoji
                        </p>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex gap-3 mt-8">
                        <button
                            onClick={handleReset}
                            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors bg-slate-50 dark:bg-slate-800/50"
                        >
                            Reset
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/20 transition-all active:scale-95"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>

            {/* Floating Emoji Picker Overlay */}
            {showPicker && createPortal(
                <div 
                    className="fixed z-[10002] shadow-2xl animate-grow-in rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
                    style={{ 
                        top: pickerPos.top, 
                        left: pickerPos.left 
                    }}
                >
                    <EmojiPicker 
                        onEmojiClick={handleEmojiClick}
                        emojiStyle={EmojiStyle.APPLE}
                        theme={theme}
                        width={320}
                        height={320}
                        lazyLoadEmojis={true}
                        previewConfig={{ showPreview: false }}
                        skinTonesDisabled
                    />
                </div>,
                document.body
            )}
        </div>,
        document.body
    );
}

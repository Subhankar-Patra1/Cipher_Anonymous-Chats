import { useState } from 'react';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import GifPicker from './GifPicker';
import { useTheme } from '../context/ThemeContext';

export default function PickerPanel({ onEmojiClick, onGifClick, disableGifTab = false, onBackspace, onClose }) {
    const [activeTab, setActiveTab] = useState('emoji'); // 'emoji' | 'gif'
    const { theme } = useTheme();

    return (
        <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 rounded-lg overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700/50 transition-colors">
            {/* Tabs */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 transition-colors">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => setActiveTab('emoji')}
                        className={`
                            px-4 py-1.5 rounded-full transition-all flex items-center justify-center
                            ${activeTab === 'emoji' 
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' 
                                : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                            }
                        `}
                    >
                        <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                    </button>
                    
                    {!disableGifTab && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('gif')}
                            className={`
                                px-4 py-1.5 rounded-full transition-all flex items-center justify-center
                                ${activeTab === 'gif' 
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' 
                                    : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                                }
                            `}
                        >
                            <span className="material-symbols-outlined text-[20px]">gif</span>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {/* Backspace Button - Only visible in Emoji tab */}
                    {activeTab === 'emoji' && onBackspace && (
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault(); // Prevent focus loss
                                onBackspace();
                            }}
                            className="p-2 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            title="Backspace"
                        >
                            <span className="material-symbols-outlined text-[20px]">backspace</span>
                        </button>
                    )}
                    
                    {/* Close Button */}
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                            title="Close"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 bg-white dark:bg-slate-900 relative transition-colors">
                {activeTab === 'emoji' ? (
                    <EmojiPicker 
                        theme={theme} 
                        onEmojiClick={onEmojiClick}
                        emojiStyle={EmojiStyle.APPLE}
                        width="100%"
                        height="100%"
                        style={{ border: 'none', borderRadius: '0' }}
                    />
                ) : (
                    <GifPicker onSendGif={onGifClick} />
                )}
            </div>
        </div>
    );
}

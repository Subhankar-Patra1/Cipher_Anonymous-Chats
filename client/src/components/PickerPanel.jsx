import { useState } from 'react';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import GifPicker from './GifPicker';

export default function PickerPanel({ onEmojiClick, onGifClick, disableGifTab = false }) {
    const [activeTab, setActiveTab] = useState('emoji'); // 'emoji' | 'gif'

    return (
        <div className="flex flex-col h-full w-full bg-slate-900 rounded-lg overflow-hidden shadow-2xl border border-slate-700/50">
            {/* Tabs */}
            <div className="flex items-center gap-4 px-4 py-2 bg-slate-800/80 border-b border-slate-700">
                <button
                    type="button"
                    onClick={() => setActiveTab('emoji')}
                    className={`
                        px-4 py-1.5 rounded-full transition-all flex items-center justify-center
                        ${activeTab === 'emoji' 
                            ? 'bg-slate-700 text-white shadow-sm' 
                            : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
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
                                ? 'bg-slate-700 text-white shadow-sm' 
                                : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                            }
                        `}
                    >
                        <span className="material-symbols-outlined text-[20px]">gif</span>
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 bg-slate-900 relative">
                {activeTab === 'emoji' ? (
                    <EmojiPicker 
                        theme="dark" 
                        onEmojiClick={onEmojiClick}
                        emojiStyle={EmojiStyle.APPLE}
                        width="100%"
                        height="100%"
                    />
                ) : (
                    <GifPicker onSendGif={onGifClick} />
                )}
            </div>
        </div>
    );
}

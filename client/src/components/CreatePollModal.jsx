import React, { useState, useRef, useEffect } from 'react';
import PickerPanel from './PickerPanel';
import EmojiSmartInput from './EmojiSmartInput';

/**
 * CreatePollModal - Modal for creating a new poll with options
 */
export default function CreatePollModal({ isOpen, onClose, onSubmit }) {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [isMultipleChoice, setIsMultipleChoice] = useState(false);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [loading, setLoading] = useState(false);

    // Emoji Picker State: key -> boolean
    // Supports multiple open pickers
    const [activePickers, setActivePickers] = useState({}); 
    const [pickerPositions, setPickerPositions] = useState({});
    const pickerRefs = useRef({});

    // Close picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            setActivePickers(prev => {
                const next = { ...prev };
                let changed = false;

                Object.keys(next).forEach(key => {
                    if (!next[key]) return; // already closed

                    const pickerEl = pickerRefs.current[key];
                    
                    // 1. Check if inside Picker Popup
                    if (pickerEl && pickerEl.contains(event.target)) return;

                    // 2. Check if inside Toggle Button for this key
                    const toggleBtn = event.target.closest(`[data-picker-toggle="${key}"]`);
                    if (toggleBtn) return;

                    // 3. Check if inside Input Group for this key
                    const group = event.target.closest(`.picker-group[data-picker-id="${key}"]`);
                    if (group) return;

                    // If none of the above, Close It
                    next[key] = false;
                    changed = true;
                });

                return changed ? next : prev;
            });
        };

        const hasOpen = Object.values(activePickers).some(Boolean);
        if (hasOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activePickers]);

    const addOption = () => {
        if (options.length < 10) {
            setOptions([...options, '']);
        }
    };
    
    // ...

    // (Note: In render, we must add className="picker-group" and data-picker-id to the wrappers)
    // We'll update the render sections below in this replacement or separate chunks if needed.
    // Since this tool replaces a block, I must include the updated render parts if they are in this block?
    // No, this block is just logic. I need to update render separately or use MultiReplace?
    // Using simple replace, I'll update logic first, then render.
    
    const removeOption = (index) => {
        if (options.length > 2) {
            setOptions(options.filter((_, i) => i !== index));
        }
    };


    const updateOption = (index, value) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleEmojiClick = (key, emojiData) => {
        const emoji = emojiData.emoji;
        
        if (key === 'question') {
            // Check limit before adding emoji (250 chars max)
            if ([...question].length >= 250) return;
            setQuestion(prev => prev + emoji);
        } else {
            const idx = parseInt(key, 10);
            if (!isNaN(idx)) {
                // Check limit before adding emoji (50 chars max)
                if ([...options[idx]].length >= 50) return;
                updateOption(idx, options[idx] + emoji);
            }
        }
    };

    // Backspace handler - removes last character (emoji or text)
    const handleBackspace = (key) => {
        if (key === 'question') {
            setQuestion(prev => {
                // Handle multi-byte emoji characters correctly
                const arr = [...prev];
                arr.pop();
                return arr.join('');
            });
        } else {
            const idx = parseInt(key, 10);
            if (!isNaN(idx)) {
                const currentVal = options[idx] || '';
                const arr = [...currentVal];
                arr.pop();
                updateOption(idx, arr.join(''));
            }
        }
    };

    const togglePicker = (id, e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = activePickers[id];
        
        if (isOpen) {
            setActivePickers(prev => ({ ...prev, [id]: false }));
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        let left = rect.right - 350;
        let top = rect.bottom + 8;

        if (left < 10) left = 10;
        if (left + 350 > window.innerWidth) left = window.innerWidth - 360;

        const spaceBelow = window.innerHeight - top;
        const spaceAbove = rect.top;
        
        if (spaceBelow < 400 && spaceAbove > 410) {
             top = rect.top - 408;
        } else if (spaceBelow < 400) {
            top = window.innerHeight - 410;
        }

        setPickerPositions(prev => ({ ...prev, [id]: { top, left } }));
        // Close ALL other pickers, open only this one (singleton behavior)
        setActivePickers({ [id]: true });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate
        if (!question.trim()) return;
        const validOptions = options.filter(o => o.trim());
        if (validOptions.length < 2) return;

        setLoading(true);
        try {
            await onSubmit({
                question: question.trim(),
                options: validOptions,
                is_multiple_choice: isMultipleChoice,
                is_anonymous: isAnonymous
            });
            // Reset
            setQuestion('');
            setOptions(['', '']);
            setIsMultipleChoice(false);
            setIsAnonymous(false);
            setActivePickers({});
            onClose();
        } catch (err) {
            console.error('Failed to create poll:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const validOptionsCount = options.filter(o => o.trim()).length;

    return (
        <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 fade-in duration-200 relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-violet-500">ballot</span>
                        Create Poll
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                    >
                        <span className="material-symbols-outlined text-slate-500">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* Question */}
                    <div>
                        <label className="flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            <span>Question</span>
                            <span className={`text-xs font-normal ${[...question].length >= 250 ? 'text-red-500' : 'text-slate-400'}`}>
                                {[...question].length}/250
                            </span>
                        </label>
                        <div className="relative picker-group" data-picker-id="question">
                            <EmojiSmartInput
                                value={question}
                                onChange={setQuestion}
                                placeholder="Ask a question..."
                                className="w-full pl-4 pr-10 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all min-h-[48px] break-words"
                                maxLength={250}
                                autoFocus
                            />
                            <button
                                type="button"
                                onMouseDown={(e) => togglePicker('question', e)}
                                data-picker-toggle="question"
                                className={`absolute right-2 top-1/2 -translate-y-[40%] p-1.5 transition-colors emoji-toggle-btn ${
                                    activePickers['question'] 
                                    ? 'text-violet-500' 
                                    : 'text-slate-400 hover:text-violet-500'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                            </button>
                        </div>
                    </div>

                    {/* Options */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Options ({validOptionsCount}/10)
                        </label>
                        <div className="space-y-2">
                            {options.map((option, index) => (
                                <div key={index} className="flex items-start gap-2">
                                    <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-xs font-bold text-violet-600 dark:text-violet-300 shrink-0 mt-2">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 relative picker-group" data-picker-id={index}>
                                        <EmojiSmartInput
                                            value={option}
                                            onChange={(val) => updateOption(index, val)}
                                            placeholder={`Option ${index + 1}`}
                                            className="w-full pl-3 pr-20 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all text-sm min-h-[38px] [word-break:break-all] overflow-hidden"
                                            maxLength={50}
                                        />
                                        <div className="flex items-center gap-1 absolute right-2 top-1.5">
                                            <span className={`text-[10px] ${[...option].length >= 50 ? 'text-red-500' : 'text-slate-400'}`}>
                                                {[...option].length}/50
                                            </span>
                                            <button
                                                type="button"
                                                onMouseDown={(e) => togglePicker(index, e)}
                                                data-picker-toggle={index}
                                                className={`p-1 transition-colors emoji-toggle-btn ${
                                                    activePickers[index] 
                                                    ? 'text-violet-500' 
                                                    : 'text-slate-400 hover:text-violet-500'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">sentiment_satisfied</span>
                                            </button>
                                        </div>
                                    </div>
                                    {options.length > 2 && (
                                        <button
                                            type="button"
                                            onClick={() => removeOption(index)}
                                            className="p-1.5 mt-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {options.length < 10 && (
                            <button
                                type="button"
                                onClick={addOption}
                                className="mt-2 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 flex items-center gap-1 font-medium"
                            >
                                <span className="material-symbols-outlined text-[18px]">add</span>
                                Add option
                            </button>
                        )}
                    </div>

                    {/* Settings */}
                    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={isMultipleChoice}
                                onChange={e => setIsMultipleChoice(e.target.checked)}
                                className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-violet-500 focus:ring-violet-500"
                            />
                            <div>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                    Allow multiple choices
                                </span>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={isAnonymous}
                                onChange={e => setIsAnonymous(e.target.checked)}
                                className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-violet-500 focus:ring-violet-500"
                            />
                            <div>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                    Anonymous voting
                                </span>
                            </div>
                        </label>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading || !question.trim() || validOptionsCount < 2}
                        className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold rounded-xl hover:from-violet-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">send</span>
                                Create Poll
                            </>
                        )}
                    </button>
                </form>

                {/* Multi-Picker Portal/Absolute Renders */}
                {Object.keys(activePickers).map(key => {
                    if (!activePickers[key]) return null;
                    const pos = pickerPositions[key];
                    if (!pos) return null;

                    return (
                        <div 
                            key={key}
                            className="fixed z-[60] shadow-2xl rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100 border border-slate-200 dark:border-slate-700"
                            style={{ 
                                top: pos.top, 
                                left: pos.left,
                                width: '350px',
                                height: '400px'
                             }}
                            ref={el => pickerRefs.current[key] = el}
                        >
                            <PickerPanel 
                                onEmojiClick={(data) => handleEmojiClick(key, data)}
                                onGifClick={() => {}} 
                                disableGifTab={true}
                                onBackspace={() => handleBackspace(key)}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

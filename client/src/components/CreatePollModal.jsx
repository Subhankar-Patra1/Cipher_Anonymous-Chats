import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom'; // 1. Import createPortal
import PickerPanel from './PickerPanel';
import EmojiSmartInput from './EmojiSmartInput';

/**
 * CreatePollModal - Fixed with React Portal to escape clipping
 */
export default function CreatePollModal({ isOpen, onClose, onSubmit }) {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [isMultipleChoice, setIsMultipleChoice] = useState(false);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [loading, setLoading] = useState(false);

    // Emoji Picker State
    const [activePickers, setActivePickers] = useState({}); 
    const [pickerPositions, setPickerPositions] = useState({});
    const pickerRefs = useRef({});
    const modalRef = useRef(null);
    const formRef = useRef(null);
    // State to ensure portal only renders on client
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

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
        if (options.length < 10) setOptions([...options, '']);
    };

    const removeOption = (index) => {
        if (options.length > 2) setOptions(options.filter((_, i) => i !== index));
    };

    const updateOption = (index, value) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleEmojiClick = (key, emojiData) => {
        const emoji = emojiData.emoji;
        if (key === 'question') {
            if ([...question].length >= 250) return;
            setQuestion(prev => prev + emoji);
        } else {
            const idx = parseInt(key, 10);
            if (!isNaN(idx)) {
                if ([...options[idx]].length >= 50) return;
                updateOption(idx, options[idx] + emoji);
            }
        }
    };

    const handleBackspace = (key) => {
        if (key === 'question') {
            setQuestion(prev => {
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

    // Calculate position based on SCREEN coordinates
    const computePickerPosition = (key) => {
        const pickerWidth = 320; 
        const pickerHeight = 380; 
        const padding = 16; 
        const gap = 16; // Space between modal and picker

        const toggleBtn = document.querySelector(`[data-picker-toggle="${key}"]`);
        if (!toggleBtn) return null;

        const btnRect = toggleBtn.getBoundingClientRect();
        
        // Boundaries: Whole Window
        const bounds = {
            left: padding,
            top: padding,
            right: window.innerWidth - padding,
            bottom: window.innerHeight - padding
        };

        // 1. Try Right Side Positioning (Align top with button)
        let left = btnRect.right + gap;
        let top = btnRect.top - 10; // Slightly adjust top for visual alignment

        // 2. Flip to Left side if no space on the right
        if (left + pickerWidth > bounds.right) {
            left = btnRect.left - pickerWidth - gap;
        }

        // 3. Vertical Clamping (ensure it doesn't go off top/bottom)
        if (top + pickerHeight > bounds.bottom) {
            top = bounds.bottom - pickerHeight - padding;
        }
        if (top < bounds.top) {
            top = bounds.top + padding;
        }

        // 4. Final Horizontal Clamping (safety)
        const maxLeft = bounds.right - pickerWidth;
        if (left < bounds.left) left = bounds.left;
        if (left > maxLeft) left = maxLeft;

        return { top, left };
    };

    const togglePicker = (id, e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = activePickers[id];
        
        if (isOpen) {
            setActivePickers(prev => ({ ...prev, [id]: false }));
            return;
        }

        // Calculate immediately
        const pos = computePickerPosition(id);
        if (pos) {
            setPickerPositions(prev => ({ ...prev, [id]: pos }));
        }
        setActivePickers({ [id]: true });
    };

    // Keep position updated on scroll/resize
    useEffect(() => {
        const hasOpen = Object.values(activePickers).some(Boolean);
        if (!hasOpen) return;

        const updateAllPositions = () => {
            setPickerPositions(prev => {
                const next = { ...prev };
                let changed = false;
                Object.keys(activePickers).forEach(key => {
                    if (!activePickers[key]) return;
                    const pos = computePickerPosition(key);
                    if (pos) {
                        next[key] = pos;
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        };

        // Initial update in case layout shifted
        requestAnimationFrame(updateAllPositions);

        window.addEventListener('scroll', updateAllPositions, true);
        window.addEventListener('resize', updateAllPositions);
        const scrollEl = formRef.current;
        if (scrollEl) {
            scrollEl.addEventListener('scroll', updateAllPositions, { passive: true });
        }

        return () => {
            window.removeEventListener('scroll', updateAllPositions, true);
            window.removeEventListener('resize', updateAllPositions);
            if (scrollEl) {
                scrollEl.removeEventListener('scroll', updateAllPositions);
            }
        };
    }, [activePickers]);

    const handleSubmit = async (e) => {
        e.preventDefault();
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
        <>
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <div 
                    ref={modalRef}
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

                    <form ref={formRef} onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
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
                                    onClick={(e) => togglePicker('question', e)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    data-picker-toggle="question"
                                    className={`absolute right-2 top-1/2 -translate-y-[40%] p-1.5 transition-colors emoji-toggle-btn ${
                                        activePickers['question'] ? 'text-violet-500' : 'text-slate-400 hover:text-violet-500'
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
                                                    onClick={(e) => togglePicker(index, e)}
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    data-picker-toggle={index}
                                                    className={`p-1 transition-colors emoji-toggle-btn ${
                                                        activePickers[index] ? 'text-violet-500' : 'text-slate-400 hover:text-violet-500'
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
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                    Allow multiple choices
                                </span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={isAnonymous}
                                    onChange={e => setIsAnonymous(e.target.checked)}
                                    className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-violet-500 focus:ring-violet-500"
                                />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                    Anonymous voting
                                </span>
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
                                    <span className="text-sm whitespace-nowrap">Creating...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">send</span>
                                    Create Poll
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>

            {/* 2. PORTAL RENDERING 
               This moves the picker DOM node to the document body, 
               escaping all overflows and stacking contexts of the Modal.
            */}
            {mounted && createPortal(
                <>
                    {Object.keys(activePickers).map(key => {
                        if (!activePickers[key]) return null;
                        const pos = pickerPositions[key];
                        if (!pos) return null;

                        return (
                            <div 
                                key={key}
                                className="fixed shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-200/50 dark:border-slate-700/50"
                                style={{ 
                                    top: pos.top, 
                                    left: pos.left,
                                    width: '320px',
                                    height: '380px',
                                    // Use a very high z-index to stay on top of everything
                                    zIndex: 10000 
                                }}
                                ref={el => pickerRefs.current[key] = el}
                                onClick={(e) => e.stopPropagation()}
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
                </>,
                document.body
            )}
        </>
    );
}

import { useState, useEffect, useRef } from 'react';

import PickerPanel from './PickerPanel';
import ContentEditable from 'react-contenteditable';
import useAudioRecorder from '../utils/useAudioRecorder';

const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

import AISendIcon from './icons/AISendIcon';

export default function MessageInput({ 
    onSend, 
    onSendAudio, 
    disabled, 
    replyTo, 
    setReplyTo,
    onSendGif,
    editingMessage,
    onCancelEdit,
    onEditMessage,
    onTypingStart,
    onTypingStop,
    isAi = false,
    isGenerating = false, // [FIX] Add missing prop
    onStop = () => {}     // [FIX] Add missing prop
}) {
    const [html, setHtml] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const pickerRef = useRef(null);
    const editorRef = useRef(null);
    const lastRange = useRef(null);
    const [pendingGif, setPendingGif] = useState(null);

    // Typing throttle refs
    const lastTypingTime = useRef(0);
    const typingTimeoutRef = useRef(null);

    // [FIX] Ref to hold latest handleSubmit to avoid stale closures in handleKeyDown
    const handleSubmitRef = useRef(null);
    useEffect(() => {
        handleSubmitRef.current = handleSubmit;
    });

    // Populate input when editing
    useEffect(() => {
        if (editingMessage) {
            setHtml(editingMessage.content);
            if (editorRef.current) editorRef.current.focus();
        } else {
            if (!editingMessage && html === editingMessage?.content) {
                setHtml('');
            }
        }
    }, [editingMessage]);

    // [FIX] Auto-focus when replying
    useEffect(() => {
        if (replyTo && editorRef.current) {
            // Small timeout to ensure render visibility if needed, but direct focus usually works
            editorRef.current.focus();
        }
    }, [replyTo]);

    // Audio Recorder
    const { 
        isRecording, 
        duration, 
        audioBlob, 
        waveform: liveWaveform, 
        startRecording, 
        stopRecording, 
        resetRecording 
    } = useAudioRecorder();

    const [isReviewing, setIsReviewing] = useState(false);
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);
    const previewAudioRef = useRef(null);

    // Effects for Preview Audio
    useEffect(() => {
        if (!isReviewing || !audioBlob) return;
        
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        previewAudioRef.current = audio;

        audio.onended = () => setIsPlayingPreview(false);

        return () => {
            audio.pause();
            URL.revokeObjectURL(url);
        };
    }, [isReviewing, audioBlob]);

    const handleTogglePreview = () => {
        if (!previewAudioRef.current) return;
        if (isPlayingPreview) {
            previewAudioRef.current.pause();
        } else {
            previewAudioRef.current.play();
        }
        setIsPlayingPreview(!isPlayingPreview);
    };

    const handleStartRecording = () => {
        setIsReviewing(false);
        startRecording();
    };

    const handleStopRecording = () => {
        stopRecording();
        setIsReviewing(true);
    };

    const handleCancelRecording = () => {
        stopRecording(); // Ensure stopped
        resetRecording();
        setIsReviewing(false);
        setIsPlayingPreview(false);
    };

    const handleSendRecording = () => {
        if (audioBlob) {
            // Normalized waveform 0-1 (already done by hook, but ensure)
            onSendAudio(audioBlob, duration, liveWaveform); 
            handleCancelRecording(); // Clean up state
        }
    };


    // Save selection whenever cursor moves
    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
                lastRange.current = range.cloneRange();
            }
        }
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target)) {
                setShowEmoji(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        
        const domHtml = editorRef.current?.innerHTML || "";
        let content = domHtml;

        // Strip HTML (keep simple logic or improve later)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        
        const images = tempDiv.getElementsByTagName('img');
        while (images.length > 0) {
            const img = images[0];
            const alt = img.getAttribute('alt') || '';
            const textNode = document.createTextNode(alt);
            img.parentNode.replaceChild(textNode, img);
        }

        const brs = tempDiv.getElementsByTagName('br');
        while (brs.length > 0) {
            const br = brs[0];
            const newline = document.createTextNode('\n');
            br.parentNode.replaceChild(newline, br);
        }

        let plainText = tempDiv.textContent || "";
        plainText = plainText.replace(/\r\n/g, "\n");
        plainText = plainText.trimEnd();

        // Handle GIF send
        if (pendingGif) {
            // Send GIF with plainText as caption (if any)
            onSendGif(pendingGif, plainText); 
            
            // Cleanup
            setPendingGif(null);
            setHtml('');
            if (editorRef.current) editorRef.current.innerHTML = "";
            setShowEmoji(false);
            lastRange.current = null;
            onTypingStop?.();
            clearTimeout(typingTimeoutRef.current);
            return;
        }

        if (!content.trim() && !plainText) return; // Don't send empty if no GIF

        if (plainText) {
            if (editingMessage) {
                // Handle edit submission
                if (plainText !== editingMessage.content) {
                    onEditMessage(editingMessage.id, plainText);
                } else {
                    onCancelEdit();
                }
            } else {
                onSend(plainText);
            }
            
            // Cleanup
            setHtml('');
            if (editorRef.current) editorRef.current.innerHTML = "";
            setShowEmoji(false);
            lastRange.current = null;
            onTypingStop?.(); // Stop typing immediately
            clearTimeout(typingTimeoutRef.current);
        }
    };

    const handleEmojiClick = (emojiData) => {
        const hex = emojiData.unified.split('-').filter(c => c !== 'fe0f').join('-');
        
        const imageUrl = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`;
        const imageTag = `<img src="${imageUrl}" alt="${emojiData.emoji}" class="w-6 h-6 inline-block align-bottom" style="margin: 0 1px;" draggable="false" />`;
        
        if (lastRange.current) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(lastRange.current);
        } else if (editorRef.current) {
            editorRef.current.focus();
        }

        document.execCommand('insertHTML', false, imageTag);
        saveSelection(); 
    };

    const handleGifClick = (gif) => {
        setPendingGif(gif);
        setShowEmoji(false);
        if (editorRef.current) editorRef.current.focus();
    };

    const handleRemoveGif = () => {
        setPendingGif(null);
    };

    const handleChange = (evt) => {
        const newHtml = evt.target.value ?? evt.target.innerHTML;
        setHtml(newHtml);
        saveSelection();

        // Typing Detection
        if (!editingMessage && onTypingStart && onTypingStop) {
             const now = Date.now();
             
             // Emit start if not throttled
             if (now - lastTypingTime.current > 2000) {
                 onTypingStart();
                 lastTypingTime.current = now;
             }

             // Reset stop timeout
             if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
             
             // Stop after 3 seconds of inactivity
             typingTimeoutRef.current = setTimeout(() => {
                 onTypingStop();
             }, 3000);
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text");
        document.execCommand('insertText', false, text);
        saveSelection();
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            // [FIX] Use ref to get latest closure
            if (handleSubmitRef.current) {
                handleSubmitRef.current();
            }
        }
    };

    // Render Recording UI if active
    if (isRecording || isReviewing) {
        return (
            <div className="p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-t border-slate-200/50 dark:border-slate-800/50 z-10 relative transition-colors duration-300">
                <div className="flex gap-3 max-w-4xl mx-auto items-center justify-between h-[56px] px-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none transition-colors">
                    
                    {/* Left Side: Status / Delete */}
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`} />
                        <span className="text-slate-700 dark:text-slate-200 font-mono min-w-[50px]">{formatDuration(duration)}</span>
                        
                        {isRecording && (
                           <div className="flex items-center gap-[2px] h-6 ml-2">
                               {liveWaveform.map((v, i) => (
                                   <div 
                                       key={i}
                                       className="w-[3px] bg-red-400 rounded-full transition-all duration-75"
                                       style={{ height: `${20 + v * 80}%`, opacity: 0.5 + v * 0.5 }}
                                   />
                               ))}
                           </div>
                        )}
                    </div>

                    {/* Right Side: Controls */}
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleCancelRecording}
                            className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-full transition-colors"
                            title="Cancel"
                        >
                            <span className="material-symbols-outlined">delete</span>
                        </button>

                        {isRecording ? (
                            <button 
                                onClick={handleStopRecording}
                                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center justify-center text-red-500 dark:text-red-400 transition-all border border-red-500/20"
                            >
                                <span className="material-symbols-outlined">stop_circle</span>
                            </button>
                        ) : (
                            <>
                                <button 
                                    onClick={handleTogglePreview}
                                    className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors"
                                    title={isPlayingPreview ? "Pause" : "Play Preview"}
                                >
                                    <span className="material-symbols-outlined">{isPlayingPreview ? 'pause' : 'play_arrow'}</span>
                                </button>
                                <button 
                                    onClick={handleSendRecording}
                                    className="w-10 h-10 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/20 transition-all hover:scale-105 active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-[20px]">send</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Logic for placeholder vs send button
    // hasText: strictly for checking if text exists (controls placeholder)
    const hasText = html.replace(/<[^>]*>/g, '').trim().length > 0 || html.includes('<img');
    
    // hasContent: logic for enabling send button (either text OR gif)
    const hasContent = hasText || pendingGif;

    const handleBackspace = () => {
        // Restore selection if we have it
        if (lastRange.current) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(lastRange.current);
        } else if (editorRef.current) {
            // Fallback: focus to end if no range saved (though usually we have one)
             editorRef.current.focus();
             // Move caret to end
             const range = document.createRange();
             range.selectNodeContents(editorRef.current);
             range.collapse(false);
             const sel = window.getSelection();
             sel.removeAllRanges();
             sel.addRange(range);
        }
        
        document.execCommand('delete');
        saveSelection();
    };

    return (
        <div className="p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-t border-slate-200/50 dark:border-slate-800/50 z-10 relative transition-colors duration-300">
            <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto items-end">
                <div className="flex-1 flex flex-col gap-1">
                    {/* Editing Bar */}
                    {editingMessage && (
                         <div className="
                            w-full
                            flex justify-between items-center
                            bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700
                            rounded-t-2xl rounded-b-md
                            px-4 py-2 transition-colors
                         ">
                             <div className="flex flex-col">
                                 <span className="text-sm font-bold text-violet-600 dark:text-violet-300">Editing message</span>
                             </div>
                             <div className="flex gap-2">
                                 <button
                                     onClick={() => {
                                         setHtml(''); /* Clear or reset */
                                         onCancelEdit();
                                     }}
                                     className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700/50 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors"
                                     type="button"
                                 >
                                     Cancel
                                 </button>
                             </div>
                         </div>
                    )}
                    
                    {!editingMessage && replyTo && (
                        <div className="
                            w-full
                            flex justify-between items-start
                            bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700
                            rounded-t-2xl rounded-b-md
                            px-4 py-2 transition-colors
                        ">
                             <div className="flex items-center gap-2 max-w-[90%]">
                                {replyTo.type === 'audio' ? (
                                    <>
                                         <span className="material-symbols-outlined text-violet-500 dark:text-violet-300 text-sm">mic</span>
                                         <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-violet-600 dark:text-violet-300">{replyTo.sender}</span>
                                            <span className="text-xs text-slate-600 dark:text-slate-300">Voice message</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-violet-600 dark:text-violet-300">{replyTo.sender}</span>
                                        <span className="text-sm text-slate-600 dark:text-slate-300 break-words line-clamp-2">{replyTo.text}</span>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setReplyTo(null)}
                                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>
                    )}

                    <div className={`
                        relative bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-violet-500/50 transition-all flex flex-col
                        ${replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} 
                        shadow-sm dark:shadow-none
                    `}>
                        {/* Pending GIF Preview */}
                        {pendingGif && (
                             <div className="p-3 border-b border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/30 rounded-t-2xl flex justify-center relative transition-colors">
                                 <div className="composer-gif-preview rounded-xl relative inline-block group">
                                     <video
                                         src={pendingGif.mp4_url || pendingGif.gif_url}
                                         className="w-[220px] h-auto rounded-md shadow-lg bg-black/50 ring-1 ring-white/10"
                                         autoPlay
                                         muted
                                         loop
                                         playsInline
                                         controls={false}
                                         onClick={(e) => {
                                             if (e.target.paused) e.target.play();
                                             else e.target.pause();
                                         }}
                                     />
                                     <button 
                                        onClick={handleRemoveGif}
                                        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all backdrop-blur-md shadow-sm"
                                        title="Remove GIF"
                                     >
                                        <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                                     </button>
                                 </div>
                             </div>
                        )}

                        
                        <div className="flex items-end relative">
                            {showEmoji && (
                                <div 
                                    className="fixed bottom-[80px] left-1/2 -translate-x-1/2 z-50 shadow-2xl rounded-lg w-[90vw] h-[400px] sm:w-[400px] sm:absolute sm:bottom-full sm:mb-2 sm:left-auto sm:right-0 sm:translate-x-0 overflow-hidden" 
                                    ref={pickerRef}
                                >
                                    <PickerPanel 
                                        onEmojiClick={handleEmojiClick}
                                        onGifClick={handleGifClick}
                                        disableGifTab={isAi || !!pendingGif}
                                        onBackspace={handleBackspace}
                                    />
                                </div>
                            )}
                            <ContentEditable
                                innerRef={editorRef}
                                html={html}
                                disabled={disabled}
                                onChange={handleChange}
                                onPaste={handlePaste}
                                onKeyUp={saveSelection}
                                onMouseUp={saveSelection}
                                onKeyDown={handleKeyDown}
                                className="w-full text-slate-800 dark:text-slate-100 pl-4 pr-2 py-3 focus:outline-none min-h-[48px] max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
                                tagName="div"
                            />
                            
                            {!hasText && (
                                <div className="absolute left-4 top-3 text-slate-400 dark:text-slate-500 pointer-events-none select-none transition-colors">
                                    {pendingGif 
                                        ? "Enter caption (optional)..." 
                                        : "Type a message..."
                                    }
                                </div>
                            )}

                            <div className="pr-2 pb-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEmoji(!showEmoji)}
                                    className={`p-2 transition-colors flex items-center justify-center rounded-lg ${
                                        showEmoji 
                                        ? 'text-violet-500 bg-violet-50 dark:bg-slate-800 dark:text-white' 
                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                    title="Insert Emoji"
                                >
                                    <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {hasContent || isAi ? ( // [FIX] Always show Send button for AI (hide Mic)
                    <button 
                        type={isGenerating ? "button" : "submit"} // [FIX] Type button for Stop to prevent submit
                        onClick={isGenerating ? onStop : undefined} // [FIX] Call stop handler
                        className={`
                            p-3 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0
                            ${disabled && !isGenerating // [FIX] If disabled but NOT generating (e.g. just thinking), show disabled style. If generating, show Stop style.
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                                : isGenerating
                                    ? 'bg-slate-200 dark:bg-slate-700 text-red-500 hover:bg-slate-300 dark:hover:bg-slate-600 shadow-sm border border-red-200 dark:border-red-900/30' // Stop button style
                                : !hasContent
                                    ? 'bg-violet-600/50 text-white/50 cursor-default shadow-none' 
                                    : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95'
                            }
                        `}
                        disabled={disabled && !isGenerating} // Enable if generating (to click stop)
                    >
                        {isGenerating ? (
                             <span className="material-symbols-outlined animate-pulse">stop_circle</span>
                        ) : isAi ? (
                            <AISendIcon className="w-6 h-6 text-white" />
                        ) : (
                            <span className="material-symbols-outlined">send</span>
                        )}
                    </button>
                ) : (
                    <button 
                        type="button" 
                        onClick={handleStartRecording}
                        className={`
                            p-3 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0
                            ${disabled 
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                            }
                        `}
                        disabled={disabled}
                        title="Record voice message"
                    >
                         <span className="material-symbols-outlined">mic</span>
                    </button>
                )}
            </form>
        </div>
    );
}

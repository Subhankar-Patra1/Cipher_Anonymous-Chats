import { useState, useEffect, useRef } from 'react';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import ContentEditable from 'react-contenteditable';
import useAudioRecorder from '../utils/useAudioRecorder';

const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function MessageInput({ onSend, onSendAudio, disabled, replyTo, setReplyTo }) {
    const [html, setHtml] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const pickerRef = useRef(null);
    const editorRef = useRef(null);
    const lastRange = useRef(null);

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
        if (!content.trim()) return;

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

        if (plainText) {
            onSend(plainText);
            setHtml('');
            if (editorRef.current) editorRef.current.innerHTML = "";
            setShowEmoji(false);
            lastRange.current = null;
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

    const handleChange = (evt) => {
        const newHtml = evt.target.value ?? evt.target.innerHTML;
        setHtml(newHtml);
        saveSelection();
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
            handleSubmit();
        }
    };

    // Render Recording UI if active
    if (isRecording || isReviewing) {
        return (
            <div className="p-4 bg-slate-900/50 backdrop-blur-md border-t border-slate-800/50 z-10 relative">
                <div className="flex gap-3 max-w-4xl mx-auto items-center justify-between h-[56px] px-4 rounded-2xl bg-slate-800/80 border border-slate-700">
                    
                    {/* Left Side: Status / Delete */}
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`} />
                        <span className="text-slate-200 font-mono min-w-[50px]">{formatDuration(duration)}</span>
                        
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
                            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                            title="Cancel"
                        >
                            <span className="material-symbols-outlined">delete</span>
                        </button>

                        {isRecording ? (
                            <button 
                                onClick={handleStopRecording}
                                className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-red-400 transition-all border border-red-500/20"
                            >
                                <span className="material-symbols-outlined">stop_circle</span>
                            </button>
                        ) : (
                            <>
                                <button 
                                    onClick={handleTogglePreview}
                                    className="p-2 text-slate-300 hover:text-white transition-colors"
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

    return (
        <div className="p-4 bg-slate-900/50 backdrop-blur-md border-t border-slate-800/50 z-10 relative">
            <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto items-end">
                <div className="flex-1 flex flex-col gap-1">
                    {replyTo && (
                        <div className="
                            w-full
                            flex justify-between items-start
                            bg-slate-800/60 border border-slate-700
                            rounded-t-2xl rounded-b-md
                            px-4 py-2
                        ">
                             <div className="flex items-center gap-2 max-w-[90%]">
                                {replyTo.type === 'audio' ? (
                                    <>
                                         <span className="material-symbols-outlined text-violet-300 text-sm">mic</span>
                                         <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-violet-300">{replyTo.sender}</span>
                                            <span className="text-xs text-slate-300">Voice message</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-violet-300">{replyTo.sender}</span>
                                        <span className="text-sm text-slate-300 break-words line-clamp-2">{replyTo.text}</span>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setReplyTo(null)}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>
                    )}

                    <div className={`
                        relative bg-slate-800/50 border border-slate-700 focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-violet-500/50 transition-all flex flex-col
                        ${replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} 
                    `}>
                        {showEmoji && (
                            <div 
                                className="fixed bottom-[80px] left-1/2 -translate-x-1/2 z-50 shadow-2xl rounded-xl w-[90vw] sm:w-[350px] sm:left-auto sm:right-4 sm:translate-x-0" 
                                ref={pickerRef}
                            >
                                <EmojiPicker 
                                    theme="dark" 
                                    onEmojiClick={handleEmojiClick}
                                    emojiStyle={EmojiStyle.APPLE}
                                    width="100%"
                                    height={350}
                                />
                            </div>
                        )}
                        
                        <div className="flex items-end">
                            <ContentEditable
                                innerRef={editorRef}
                                html={html}
                                disabled={disabled}
                                onChange={handleChange}
                                onPaste={handlePaste}
                                onKeyUp={saveSelection}
                                onMouseUp={saveSelection}
                                onKeyDown={handleKeyDown}
                                className="w-full text-slate-100 pl-4 pr-2 py-3 focus:outline-none min-h-[48px] max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar"
                                tagName="div"
                            />
                            
                            {!html && (
                                <div className="absolute left-4 top-3 text-slate-500 pointer-events-none select-none">
                                    {disabled ? "Room expired..." : "Type a message..."}
                                </div>
                            )}

                            <div className="pr-2 pb-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEmoji(!showEmoji)}
                                    className={`p-2 transition-colors flex items-center justify-center rounded-lg ${
                                        showEmoji 
                                        ? 'text-white' 
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                    title="Insert Emoji"
                                >
                                    <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {html.trim() ? (
                    <button 
                        type="submit" 
                        className={`
                            p-3 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0
                            ${disabled 
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95'
                            }
                        `}
                        disabled={disabled}
                    >
                        <span className="material-symbols-outlined">send</span>
                    </button>
                ) : (
                    <button 
                        type="button" 
                        onClick={handleStartRecording}
                        className={`
                            p-3 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0
                            ${disabled 
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
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

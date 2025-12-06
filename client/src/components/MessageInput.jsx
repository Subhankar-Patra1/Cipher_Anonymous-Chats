import { useState, useEffect, useRef } from 'react';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import ContentEditable from 'react-contenteditable';

export default function MessageInput({ onSend, disabled }) {
    const [html, setHtml] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const pickerRef = useRef(null);
    const editorRef = useRef(null);
    const textCheckerRef = useRef(null); // Hidden div for parsing
    const lastRange = useRef(null); // Keep track of cursor position

    // Save selection whenever cursor moves
    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            // Ensure the selection is actually inside our editor
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
        
        // 1. Update handleSubmit() so it ALWAYS reads the actual DOM input
        // Read current content from DOM to avoid stale state
        const domHtml = editorRef.current?.innerHTML || "";
        
        // Use domHtml for checks
        // Parse HTML to Text with Unicode
        let content = domHtml;
        if (!content.trim()) return;

        // Create temp element to extract text and handle emoji imgs
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        
        // Replace all images with their alt text (unicode)
        const images = tempDiv.getElementsByTagName('img');
        while (images.length > 0) {
            const img = images[0];
            const alt = img.getAttribute('alt') || '';
            const textNode = document.createTextNode(alt);
            img.parentNode.replaceChild(textNode, img);
        }
        
        const plainText = tempDiv.innerText.trim();

        if (plainText) {
            onSend(plainText);
            // 2. After sending, clear BOTH the state and the DOM editor
            setHtml('');
            if (editorRef.current) {
                editorRef.current.innerHTML = "";
            }
            setShowEmoji(false);
            lastRange.current = null; // Reset selection
        }
    };

    const handleEmojiClick = (emojiData) => {
        // Use Apple style URL from stable CDN
        // Ensure we strip fe0f from the unified code to match CDN filenames
        const hex = emojiData.unified.split('-').filter(c => c !== 'fe0f').join('-');
        
        const imageUrl = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`;
        const imageTag = `<img src="${imageUrl}" alt="${emojiData.emoji}" class="w-6 h-6 inline-block align-bottom" style="margin: 0 1px;" draggable="false" />`;
        
        // Restore selection if we have one
        if (lastRange.current) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(lastRange.current);
        } else if (editorRef.current) {
            // Fallback to focus if no selection saved (should typically insert at start or end depending on browser)
            editorRef.current.focus();
        }

        document.execCommand('insertHTML', false, imageTag);
        
        saveSelection(); 
    };

    const handleChange = (evt) => {
        // 4. Fix handleChange to properly keep state in sync
        const newHtml = evt.target.value ?? evt.target.innerHTML;
        setHtml(newHtml);
        saveSelection(); // Save after typing
    };

    const handlePaste = (e) => {
        // 3. Pasted text should be inserted exactly as typed
        e.preventDefault();
        const text = e.clipboardData.getData("text");
        document.execCommand('insertText', false, text); // insertTextAsIs implementation
        saveSelection();
    };

    const handleKeyDown = (e) => {
        // 3. Fix Enter key behavior in the ContentEditable
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit(); // DO NOT rely on event or state logic inside specific to event
        }
        // Shift + Enter = default newline behavior
    };

    return (
        <div className="p-4 bg-slate-900/50 backdrop-blur-md border-t border-slate-800/50 z-10 relative">
            <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto items-end">
                <div className="relative flex-1 bg-slate-800/50 rounded-xl border border-slate-700 focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-violet-500/50 transition-all flex flex-col">
                    {showEmoji && (
                        <div className="absolute bottom-full right-0 mb-4 z-50 shadow-2xl rounded-xl" ref={pickerRef}>
                            <EmojiPicker 
                                theme="dark" 
                                onEmojiClick={handleEmojiClick}
                                emojiStyle={EmojiStyle.APPLE} // Force Apple style in picker too
                                width={300}
                                height={400}
                                searchDisabled={false}
                                skinTonesDisabled={true}
                                style={{
                                    '--epr-picker-border-color': '#1e293b',
                                    '--epr-bg-color': '#0f172a',
                                    '--epr-category-label-bg-color': '#0f172a',
                                    '--epr-text-color': '#f1f5f9',
                                    '--epr-search-input-bg-color': '#1e293b',
                                    '--epr-search-input-text-color': '#f1f5f9',
                                    '--epr-scrollbar-thumb-color': '#334155',
                                    '--epr-scrollbar-thumb-hover-color': '#475569',
                                    '--epr-preview-text-color': '#f1f5f9',
                                }}
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
                            onKeyUp={saveSelection} // Track arrow keys
                            onMouseUp={saveSelection} // Track clicks
                            onKeyDown={handleKeyDown}
                            className="w-full text-slate-100 pl-4 pr-2 py-3 focus:outline-none min-h-[48px] max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar"
                            tagName="div"
                        />
                        
                        {/* Placeholder logic using absolute positioning if empty */}
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

                <button 
                    type="submit" 
                    className={`
                        p-3 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0
                        ${disabled || !html.trim() 
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                            : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95'
                        }
                    `}
                    disabled={disabled || !html.trim()}
                >
                    <span className="material-symbols-outlined">send</span>
                </button>
            </form>
        </div>
    );
}

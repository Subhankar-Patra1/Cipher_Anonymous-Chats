import { useState, useRef, useEffect } from 'react';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import ContentEditable from 'react-contenteditable';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

// Helper to format bytes
const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// Helper for file icons (reused logic could be extracted)
const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
        case 'pdf': return 'picture_as_pdf';
        case 'doc': case 'docx': return 'description';
        case 'xls': case 'xlsx': return 'table_view';
        case 'ppt': case 'pptx': return 'slideshow';
        case 'zip': case 'rar': case '7z': return 'folder_zip';
        case 'txt': return 'text_snippet';
        default: return 'insert_drive_file';
    }
};

const getFileColor = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
        case 'pdf': return 'text-red-500';
        case 'doc': case 'docx': return 'text-blue-500';
        case 'xls': case 'xlsx': return 'text-green-500';
        case 'ppt': case 'pptx': return 'text-orange-500';
        case 'zip': case 'rar': return 'text-amber-600';
        default: return 'text-slate-500';
    }
};

export default function FilePreviewModal({ files, onClose, onSend, recipientName, recipientAvatar }) {
    // State
    const [fileStates, setFileStates] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    
    // UI State
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    // Init Logic
    useEffect(() => {
        if (!files || files.length === 0) return;
        
        const initStates = files.map((f, i) => ({
            id: `file-${i}-${Date.now()}`,
            file: f,
            url: URL.createObjectURL(f),
            caption: '' // [NEW] Individual caption
        }));
        setFileStates(initStates);
        setCurrentIndex(0);

        return () => {
            initStates.forEach(s => URL.revokeObjectURL(s.url));
        };
    }, [files]);

    // Current Active File
    const currentFileState = fileStates[currentIndex];

    // [NEW] Update caption for current file
    const updateCurrentCaption = (newCaption) => {
        setFileStates(prev => prev.map((s, i) => 
            i === currentIndex ? { ...s, caption: newCaption } : s
        ));
    };

    const handleClose = () => {
        onClose();
    };

    const handleRemoveFile = (e, indexToRemove) => {
        e.stopPropagation();
        if (fileStates.length <= 1) {
            onClose();
            return;
        }

        const newStates = fileStates.filter((_, i) => i !== indexToRemove);
        setFileStates(newStates);

        // Adjust index
        if (currentIndex === indexToRemove) {
            setCurrentIndex(prev => Math.max(0, prev - 1));
        } else if (currentIndex > indexToRemove) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const handleAddFiles = (e) => {
        if (e.target.files?.length > 0) {
            const newFiles = Array.from(e.target.files);
            const newStates = newFiles.map((f, i) => ({
                id: `file-added-${Date.now()}-${i}`,
                file: f,
                url: URL.createObjectURL(f),
                caption: ''
            }));
            setFileStates(prev => [...prev, ...newStates]);
            e.target.value = ''; // Reset
        }
    };

    const handleSendClick = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        
        try {
            // Prepare payload: array of { file, caption }
            const filesToSend = fileStates.map(s => {
                // Strip HTML for sending, but keep emojis? 
                // Emojis as <img> tags need to be converted to native chars or text?
                // The current input logic appends native char in onEmojiClick for simplicity in previous step.
                // But if we allowed HTML in onChange, we might have <br> or <div>.
                // Simple strip:
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = s.caption || '';
                // 1. Replace emoji images with their alt text (native emoji)
                const images = tempDiv.getElementsByTagName('img');
                while (images.length > 0) {
                    const img = images[0];
                    const alt = img.getAttribute('alt') || '';
                    const textNode = document.createTextNode(alt);
                    img.parentNode.replaceChild(textNode, img);
                }
                const plainText = (tempDiv.textContent || "").trim();
                
                return {
                    file: s.file,
                    caption: plainText
                };
            });
            
            onSend(filesToSend); // Pass array of objects
            
        } catch (e) {
            console.error(e);
        } finally {
            setIsProcessing(false);
        }
    };

    if (fileStates.length === 0) return null;

    const isPdf = currentFileState?.file.type === 'application/pdf';

    return (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-50 flex flex-col items-center animate-in fade-in duration-200">
             <style>{`
                /* Carousel Scrollbar */
                .carousel-scroll::-webkit-scrollbar { height: 6px; }
                .carousel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
                .carousel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
                
                /* PDF Iframe Scrollbar */
                .pdf-frame::-webkit-scrollbar { width: 8px; }
                .pdf-frame::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 4px; }
            `}</style>
            
            {/* HEADER */}
            <div className="w-full max-w-5xl p-4 flex items-center justify-between z-50 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={handleClose} className="p-2 -ml-2 rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    {/* Recipient Info */}
                    <div className="hidden sm:flex items-center gap-2">
                        {recipientAvatar ? (
                            <img src={recipientAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs">
                                {recipientName?.charAt(0)}
                            </div>
                        )}
                        <span className="text-slate-800 dark:text-white font-medium">{renderTextWithEmojis(recipientName)}</span>
                    </div>
                </div>
            </div>

            {/* MAIN PREVIEW */}
            <div className="flex-1 w-full flex items-center justify-center p-4 pb-0 overflow-hidden min-h-0 relative">
                 {isPdf ? (
                     <iframe 
                        src={currentFileState.url}
                        className="w-full h-full max-w-4xl bg-white rounded-lg shadow-xl pdf-frame"
                        title="PDF Preview"
                     />
                 ) : (
                     <div className="flex flex-col items-center justify-center gap-6 p-12 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-w-md w-full text-center">
                         <div className={`w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-2`}>
                             <span className={`material-symbols-outlined text-[64px] ${getFileColor(currentFileState.file.name)}`}>
                                 {getFileIcon(currentFileState.file.name)}
                             </span>
                         </div>
                         <div className="space-y-1">
                             <h3 className="text-xl font-bold text-slate-800 dark:text-white break-all line-clamp-2">
                                 {currentFileState.file.name}
                             </h3>
                             <p className="text-sm text-slate-500 font-medium">
                                 {formatBytes(currentFileState.file.size)} • {currentFileState.file.name.split('.').pop().toUpperCase()}
                             </p>
                         </div>
                         <div className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-mono text-slate-500 dark:text-slate-400">
                             No preview available
                         </div>
                     </div>
                 )}
            </div>

            {/* CAROUSEL */}
            <div className="w-full max-w-3xl px-4 py-2 mt-4 mb-20 z-50">
                <div className="flex gap-2 overflow-x-auto carousel-scroll py-2 px-1 justify-center">
                    {fileStates.map((state, idx) => {
                        const icon = getFileIcon(state.file.name);
                        const isSelected = idx === currentIndex;
                        return (
                            <div
                                key={state.id}
                                onClick={() => setCurrentIndex(idx)}
                                className={`relative w-16 h-16 rounded-xl flex items-center justify-center cursor-pointer transition-all shrink-0 bg-white dark:bg-slate-800 border-2 ${
                                    isSelected
                                    ? 'border-violet-500 scale-105 shadow-md z-10' 
                                    : 'border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-slate-500 opacity-70 hover:opacity-100'
                                }`}
                                title={state.file.name}
                            >
                                <span className={`material-symbols-outlined text-2xl ${getFileColor(state.file.name)}`}>
                                    {icon}
                                </span>
                                
                                <button
                                    onClick={(e) => handleRemoveFile(e, idx)}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-slate-800 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity shadow-sm z-20"
                                    title="Remove file"
                                >
                                    <span className="material-symbols-outlined text-[12px] font-bold">close</span>
                                </button>
                            </div>
                        );
                    })}

                    {/* Add More Button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="relative w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 transition-all shrink-0 bg-white/5 dark:bg-slate-800/50"
                        title="Add more files"
                    >
                         <span className="material-symbols-outlined">add</span>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        multiple 
                        onChange={handleAddFiles} 
                    />
                </div>
            </div>

            {/* CAPTION BAR */}
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-white via-white/80 to-transparent dark:from-slate-900 dark:via-slate-900/80 pt-12 pb-6 px-4 z-50 pointer-events-none">
                <div className="max-w-3xl mx-auto flex items-end gap-3 pointer-events-auto">
                     <div className="flex-1 bg-slate-100 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl flex items-center border border-slate-200 dark:border-white/10 focus-within:border-violet-500/50 transition-colors shadow-lg relative min-h-[50px]">
                        <button 
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className={`pl-3 pr-2 py-3 h-full flex items-center justify-center text-slate-400 hover:text-yellow-400 transition-colors ${showEmojiPicker ? 'text-yellow-400' : ''}`}
                        >
                             <span className="material-symbols-outlined text-[24px]">mood</span>
                        </button>
                        
                        {showEmojiPicker && (
                            <div className="absolute bottom-full left-0 mb-4 z-50 animate-in fade-in zoom-in-95 duration-200 origin-bottom-left">
                                <EmojiPicker
                                    theme="dark"
                                    emojiStyle={EmojiStyle.APPLE}
                                    onEmojiClick={(emojiData) => {
                                        const hex = emojiData.unified.split('-').filter(c => c !== 'fe0f').join('-');
                                        const imageUrl = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`;
                                        const imageTag = `<img src="${imageUrl}" alt="${emojiData.emoji}" class="w-6 h-6 inline-block align-bottom" style="margin: 0 1px;" draggable="false" />`;
                                        
                                        if (document.activeElement === inputRef.current) {
                                            document.execCommand('insertHTML', false, imageTag);
                                            updateCurrentCaption(inputRef.current.innerHTML);
                                        } else {
                                            const newContent = (currentFileState?.caption || '') + imageTag;
                                            updateCurrentCaption(newContent);
                                        }
                                    }}
                                    lazyLoadEmojis={true}
                                />
                            </div>
                        )}

                        <div className="relative flex-1 min-w-0 h-full flex items-center">
                            <ContentEditable
                                innerRef={inputRef}
                                html={currentFileState?.caption || ''} 
                                onChange={(e) => {
                                    // [FIX] Allow HTML (for emoji images) but strip for state if needed
                                    // Actually, if we want Apple style in input, we must store HTML or map back/forth.
                                    // Simple fix: Store HTML in local state? No, we need per-file.
                                    // Let's store the raw HTML in fileStates.caption so images persist in input.
                                    // When sending, we scrape text content or keep HTML? 
                                    // Backend expects text for consistency? 
                                    // ChatWindow linkifies. 
                                    // Let's stick to storing the value as is (HTML with img tags for emojis).
                                    // BUT helper `renderTextWithEmojis` converts text->html. 
                                    // We need to strip HTML when sending? Or just send text.
                                    updateCurrentCaption(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendClick();
                                    }
                                }}
                                className="w-full bg-transparent text-slate-800 dark:text-white border-0 focus:ring-0 outline-none focus:outline-none py-3 pr-4 pl-2 placeholder:text-slate-500 dark:placeholder:text-slate-400 self-center max-h-[100px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar"
                                tagName="div"
                            />
                            {!(currentFileState?.caption) && (
                                <div className="absolute left-2 top-0 h-full flex items-center pointer-events-none text-slate-500 dark:text-slate-400 select-none">
                                    Add a caption ({currentIndex + 1}/{fileStates.length})...
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <button
                        onClick={handleSendClick}
                        disabled={isProcessing}
                        className="w-12 h-12 bg-violet-600 hover:bg-violet-700 text-white rounded-full shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center shrink-0"
                    >
                         {isProcessing ? (
                            <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
                        ) : (
                            <div className="relative flex items-center justify-center">
                                <span className="material-symbols-outlined filled text-[24px] leading-none mt-0.5 ml-0.5">send</span>
                                {fileStates.length > 1 && (
                                    <span className="absolute -top-2 -right-2 bg-white text-violet-600 text-[10px] font-bold px-1 rounded-full shadow-sm border border-violet-100">
                                        {fileStates.length}
                                    </span>
                                )}
                            </div>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

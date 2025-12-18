import { useState, useRef, useEffect } from 'react';
import ReactCrop from 'react-image-crop';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import ContentEditable from 'react-contenteditable';
import 'react-image-crop/dist/ReactCrop.css';
import getCroppedImg from '../utils/cropImage';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

export default function ImagePreviewModal({ files, onClose, onSend, recipientName, recipientAvatar }) {
    // State for all files
    // Each item: { original: File, current: Blob, id: string }
    const [fileStates, setFileStates] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Editing State (Current Image)
    const [isCropping, setIsCropping] = useState(false);
    const [crop, setCrop] = useState(null);
    const [completedCrop, setCompletedCrop] = useState(null);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isRotated, setIsRotated] = useState(false); // Track if rotation happened (for Undo availability)
    
    // Meta/Global State
    const [html, setHtml] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isViewOnce, setIsViewOnce] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const imgRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null); // [NEW] For adding more images
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

    // Init Logic
    useEffect(() => {
        if (!files || files.length === 0) return;
        
        const initStates = files.map((f, i) => ({
            id: `img-${i}-${Date.now()}`,
            original: f,
            current: f, // Starts same as original
            modified: false
        }));
        setFileStates(initStates);
        setCurrentIndex(0);
    }, [files]);

    // Current Active File
    const currentFileState = fileStates[currentIndex];
    const [previewUrl, setPreviewUrl] = useState(null);

    // Update preview URL when index or file state changes
    useEffect(() => {
        if (!currentFileState) return;
        const url = URL.createObjectURL(currentFileState.current);
        setPreviewUrl(url);
        
        // Reset local edit states when switching or updating blob
        setIsCropping(false);
        setCrop(null);
        setCompletedCrop(null);
        setIsFlipped(false);
        // isRotated tracks if *current blob* is different from *original* conceptually regarding clean edits? 
        // Actually, 'modified' flag handles undo availability.
        
        return () => URL.revokeObjectURL(url);
    }, [currentFileState]);

    const handleClose = () => {
        onClose();
    };

    const updateCurrentFile = (newBlob) => {
        setFileStates(prev => prev.map((s, i) => 
            i === currentIndex 
            ? { ...s, current: newBlob, modified: true } 
            : s
        ));
    };

    const handleRotate = async () => {
        if (!previewUrl || isProcessing) return;
        setIsProcessing(true);
        try {
            const rotatedBlob = await getCroppedImg(previewUrl, null, 90);
            updateCurrentFile(rotatedBlob);
            setIsRotated(true);
        } catch (e) {
            console.error('Rotation failed', e);
        } finally {
            setIsProcessing(false);
        }
    };

    // Apply Crop/Flip to current blob and save it
    const handleDone = async () => {
        if (!previewUrl || isProcessing) return;
        
        if (isCropping && (!completedCrop?.width || !completedCrop?.height) && !isFlipped) {
            setIsCropping(false);
            return;
        }

        setIsProcessing(true);
        try {
            let finalBlob;
            
            if (isCropping && completedCrop?.width && completedCrop?.height) {
                const image = imgRef.current;
                const scaleX = image.naturalWidth / image.width;
                const scaleY = image.naturalHeight / image.height;
                
                const finalCrop = {
                    x: completedCrop.x * scaleX,
                    y: completedCrop.y * scaleY,
                    width: completedCrop.width * scaleX,
                    height: completedCrop.height * scaleY
                };

                finalBlob = await getCroppedImg(
                    previewUrl,
                    finalCrop,
                    0, 
                    null,
                    { horizontal: isFlipped, vertical: false }
                );
            } else if (isFlipped) {
                 finalBlob = await getCroppedImg(
                    previewUrl,
                    null,
                    0,
                    null,
                    { horizontal: isFlipped, vertical: false }
                );
            } else {
                setIsCropping(false);
                setIsProcessing(false);
                return;
            }

            updateCurrentFile(finalBlob);
            
        } catch (e) {
            console.error('Failed to apply edits', e);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUndo = () => {
        if (!currentFileState) return;
        // Revert to original
        setFileStates(prev => prev.map((s, i) => 
            i === currentIndex 
            ? { ...s, current: s.original, modified: false } 
            : s
        ));
        setIsRotated(false);
    };

    const handleRemoveFile = (e, indexToRemove) => {
        e.stopPropagation();
        if (fileStates.length <= 1) {
            onClose();
            return;
        }

        const newStates = fileStates.filter((_, i) => i !== indexToRemove);
        setFileStates(newStates);

        // Adjust index if needed
        if (currentIndex === indexToRemove) {
            // If removing current, move to previous, or stay at 0
            setCurrentIndex(prev => Math.max(0, prev - 1));
        } else if (currentIndex > indexToRemove) {
            // If removing one before current, shift current down
            setCurrentIndex(prev => prev - 1);
        }
    };

    const handleSendClick = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        
        try {
            // Prepare all files
            // If current image has pending crop/flip in UI (user didn't click Done), should we apply it?
            // Let's assume WYSIWYG - if they are in crop mode, we apply it. 
            // Reuse handleDone logic? handleDone updates state. 
            // Let's just iterate through fileStates.
            
            // Wait, if I am currently cropping, `currentFileState.current` is STALE (it's the pre-crop version).
            // So if `isCropping` or `isFlipped` is true, we need to process the *current* view first.
            
            let finalFiles = [...fileStates];
            
            if (isCropping || isFlipped) {
                // Apply pending edits to current index
                 let currentBlob = finalFiles[currentIndex].current; // Default
                 if (previewUrl && imgRef.current) {
                      // Duplicate logic from handleDone, but synchronous-style for flow
                      // Actually better to just reuse logic or copy-paste
                      let activeBlob;
                      if (isCropping && completedCrop?.width && completedCrop?.height) {
                            const image = imgRef.current;
                            const scaleX = image.naturalWidth / image.width;
                            const scaleY = image.naturalHeight / image.height;
                            const finalCrop = {
                                x: completedCrop.x * scaleX,
                                y: completedCrop.y * scaleY,
                                width: completedCrop.width * scaleX,
                                height: completedCrop.height * scaleY
                            };
                            activeBlob = await getCroppedImg(previewUrl, finalCrop, 0, null, { horizontal: isFlipped, vertical: false });
                      } else if (isFlipped) {
                            activeBlob = await getCroppedImg(previewUrl, null, 0, null, { horizontal: isFlipped, vertical: false });
                      }
                      
                      if (activeBlob) {
                          finalFiles[currentIndex] = { ...finalFiles[currentIndex], current: activeBlob };
                      }
                 }
            }

            // Extract blobs and dimensions
            const filesToSend = [];
            const configs = [];
            
            for (const state of finalFiles) {
                // We need dimensions. 
                // Either we loaded them when viewing, or we need to load them now.
                // We can't rely on `imgRef` for images that aren't currently visible.
                // We must load them.
                
                const blob = state.current;
                const url = URL.createObjectURL(blob);
                const img = new Image();
                await new Promise(r => { img.onload = r; img.src = url; });
                
                filesToSend.push(blob);
                configs.push({ width: img.naturalWidth, height: img.naturalHeight });
                URL.revokeObjectURL(url);
            }

            // Text processing
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const images = tempDiv.getElementsByTagName('img');
            while (images.length > 0) {
                const img = images[0];
                const alt = img.getAttribute('alt') || '';
                const textNode = document.createTextNode(alt);
                img.parentNode.replaceChild(textNode, img);
            }
            const plainText = (tempDiv.textContent || "").trim();

            onSend(filesToSend, plainText, configs, isViewOnce);
            
        } catch (e) {
            console.error(e);
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleCrop = () => {
        setIsCropping(prev => {
            const newState = !prev;
            if (newState && imgRef.current) {
                setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
            }
            return newState;
        });
    };
    const toggleFlip = () => setIsFlipped(prev => !prev);

    if (fileStates.length === 0) return null;

    return (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-50 flex flex-col items-center animate-in fade-in duration-200">
             <style>{`
                .ReactCrop__crop-selection { border: 2px solid rgba(255, 255, 255, 0.8); }
                .ReactCrop__drag-handle { width: 10px; height: 10px; background-color: white; border: 1px solid rgba(0,0,0,0.2); }
                
                /* Carousel Scrollbar */
                .carousel-scroll::-webkit-scrollbar { height: 6px; }
                .carousel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
                .carousel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
            `}</style>
            
            {/* HEADER */}
            <div className="w-full max-w-5xl p-4 flex items-center justify-between z-50 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={handleClose} className="p-2 -ml-2 rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    {/* Recipient Info - Hidden on small screens if needed, but keeping for now */}
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

                <div className="flex items-center gap-2">
                    {currentFileState?.modified && (
                        <button onClick={handleUndo} className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-full transition-all" title="Undo">
                            <span className="material-symbols-outlined">undo</span>
                        </button>
                    )}
                    {(isCropping || isFlipped) && (
                        <button onClick={handleDone} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-full text-sm font-medium transition-all shadow-lg">
                            Done
                        </button>
                    )}
                    <button onClick={toggleCrop} className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isCropping ? 'bg-indigo-100 text-indigo-600 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
                        <span className="material-symbols-outlined">crop</span>
                    </button>
                    <button onClick={handleRotate} className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-full transition-all">
                        <span className="material-symbols-outlined">rotate_right</span>
                    </button>
                    <button onClick={toggleFlip} className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isFlipped ? 'text-violet-600 bg-violet-50 dark:bg-transparent dark:text-violet-400' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
                        <span className="material-symbols-outlined">flip</span>
                    </button>
                </div>
            </div>

            {/* MAIN PREVIEW */}
            <div className="flex-1 w-full flex items-center justify-center p-4 pb-0 overflow-hidden min-h-0 relative">
                 {isCropping ? (
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        className="max-h-full max-w-full"
                        style={{ maxHeight: '60vh', maxWidth: '100%' }}
                    >
                        <img 
                            ref={imgRef}
                            src={previewUrl}
                            alt=""
                            className="max-h-[60vh] w-auto object-contain"
                            style={{ transform: isFlipped ? `scaleX(-1)` : 'none', maxWidth: '100%' }}
                        />
                    </ReactCrop>
                 ) : (
                    <img 
                        ref={imgRef}
                        src={previewUrl}
                        alt=""
                        className="max-h-[60vh] w-auto object-contain shadow-2xl"
                        style={{ transform: isFlipped ? `scaleX(-1)` : 'none', maxWidth: '100%' }}
                    />
                 )}
            </div>

            {/* CAROUSEL */}
            <div className="w-full max-w-3xl px-4 py-2 mt-2 mb-20 z-50">
                <div className="flex gap-2 overflow-x-auto carousel-scroll py-2 px-1 justify-center">
                    {fileStates.map((state, idx) => (
                        <div
                            key={state.id}
                            onClick={() => setCurrentIndex(idx)}
                            className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer group/item ${
                                idx === currentIndex 
                                ? 'border-violet-500 scale-110 shadow-md' 
                                : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                        >
                            <img 
                                src={URL.createObjectURL(state.current)} 
                                className="w-full h-full object-cover" 
                                onLoad={(e) => URL.revokeObjectURL(e.target.src)}
                            />
                            <button
                                onClick={(e) => handleRemoveFile(e, idx)}
                                className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity"
                                title="Remove image"
                            >
                                <span className="material-symbols-outlined text-[10px] font-bold">close</span>
                            </button>
                        </div>
                    ))}
                    {/* Add more button could go here */}

                    {/* Add More Button */}
                    {!isViewOnce && (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-14 h-14 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 transition-all shrink-0 bg-white/5 dark:bg-slate-800/50"
                            title="Add more images"
                        >
                             <span className="material-symbols-outlined">add</span>
                        </button>
                    )}
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        multiple 
                        onChange={(e) => {
                            if (e.target.files?.length > 0) {
                                const newFiles = Array.from(e.target.files);
                                const newStates = newFiles.map((f, i) => ({
                                    id: `img-added-${Date.now()}-${i}`,
                                    original: f,
                                    current: f,
                                    modified: false
                                }));
                                setFileStates(prev => [...prev, ...newStates]);
                                // Optional: switch to new file?
                                // setCurrentIndex(prev => prev + 1); 
                            }
                            e.target.value = ''; // Reset
                        }} 
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
                                            setHtml(inputRef.current.innerHTML); 
                                        } else {
                                            setHtml(prev => prev + imageTag);
                                        }
                                    }}
                                    lazyLoadEmojis={true}
                                />
                            </div>
                        )}

                        <div className="relative flex-1 min-w-0 h-full flex items-center">
                            <ContentEditable
                                innerRef={inputRef}
                                html={html}
                                onChange={(e) => setHtml(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendClick();
                                    }
                                }}
                                className="w-full bg-transparent text-slate-800 dark:text-white border-0 focus:ring-0 outline-none focus:outline-none py-3 pr-4 pl-2 placeholder:text-slate-500 dark:placeholder:text-slate-400 self-center max-h-[100px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar"
                                tagName="div"
                            />
                            {!(html.replace(/<[^>]*>/g, '').trim().length > 0 || html.includes('<img')) && (
                                <div className="absolute left-2 top-0 h-full flex items-center pointer-events-none text-slate-500 dark:text-slate-400 select-none">
                                    Add a caption...
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* View Once Toggle */}
                    {fileStates.length === 1 && (
                        <button
                            onClick={() => setIsViewOnce(!isViewOnce)}
                            className={`
                                w-10 h-10 flex items-center justify-center rounded-full mr-2 transition-all relative
                                ${isViewOnce 
                                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' 
                                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }
                            `}
                            title="View Once"
                        >
                             <div className={`w-6 h-6 flex items-center justify-center ${isViewOnce ? 'scale-110' : 'scale-100'}`}>
                                 {isViewOnce ? (
                                     /* Filled - Active */
                                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-green-600 dark:text-green-400">
                                         <circle cx="12" cy="12" r="11" fill="currentColor" />
                                         <path d="M10.5 9L12 7.5V16.5" className="stroke-white dark:stroke-slate-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                     </svg>
                                 ) : (
                                     /* Dotted - Inactive */
                                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-400 group-hover:text-slate-500">
                                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
                                          <path d="M10.5 9L12 7.5V16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                     </svg>
                                 )}
                             </div>
                        </button>
                    )}

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

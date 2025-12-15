import { useState, useRef, useEffect } from 'react';
import ReactCrop from 'react-image-crop';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import ContentEditable from 'react-contenteditable';
import 'react-image-crop/dist/ReactCrop.css';
import getCroppedImg from '../utils/cropImage';

export default function ImagePreviewModal({ file, onClose, onSend, recipientName, recipientAvatar }) {
    // Layout State
    const [previewUrl, setPreviewUrl] = useState(null);
    const imgRef = useRef(null);

    // Editing State
    const [isCropping, setIsCropping] = useState(false);
    const [crop, setCrop] = useState(null);
    const [completedCrop, setCompletedCrop] = useState(null);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isRotated, setIsRotated] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    
    // Meta State
    const [html, setHtml] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const inputRef = useRef(null);
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

    // Initialize Preview URL
    useEffect(() => {
        if (!file) return;
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);

    const resetState = () => {
        setIsCropping(false);
        setIsFlipped(false);
        setIsRotated(false);
        setCrop(null);
        setCompletedCrop(null);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    // Rotation is handled by creating a new preview URL (Rotating the actual source reference)
    // This allows the "Crop" box to naturally sit on top of the visually rotated image without complex coordinate math.
    const handleRotate = async () => {
        if (!previewUrl || isProcessing) return;
        setIsProcessing(true);
        try {
            // Rotate 90 degrees
            const rotatedBlob = await getCroppedImg(previewUrl, null, 90);
            const newUrl = URL.createObjectURL(rotatedBlob);
            
            // Clean up old url if it's not the original
            // setPreviewUrl will trigger a re-render with the new vertical/horizontal dimensions
            setPreviewUrl(newUrl);
            setIsRotated(true);
            
            // Reset crop because dimensions changed significantly
            setCrop(null);
            setCompletedCrop(null);
        } catch (e) {
            console.error('Rotation failed', e);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSendClick = async () => {
        if (isProcessing || !previewUrl || !imgRef.current) return;
        
        console.log('[DEBUG] handleSendClick triggered. imgRef:', imgRef.current);
        console.log('[DEBUG] Natural size:', imgRef.current?.naturalWidth, 'x', imgRef.current?.naturalHeight);

        setIsProcessing(true);
        try {
            let finalBlob;
            let finalWidth;
            let finalHeight;

            // Logic: If cropping and we have a valid crop
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
                
                finalWidth = Math.round(finalCrop.width);
                finalHeight = Math.round(finalCrop.height);

                finalBlob = await getCroppedImg(
                    previewUrl,
                    finalCrop,
                    0, // Rotation already baked into previewUrl
                    null,
                    { horizontal: isFlipped, vertical: false }
                );
            } else {
                // If flipping is the only edit (Rotation is baked into previewUrl)
                // Use current image natural dimensions (which reflect "baked" rotation)
                // Use stored dimensions or fallback to ref if needed
                finalWidth = imageDimensions.width || imgRef.current?.naturalWidth;
                finalHeight = imageDimensions.height || imgRef.current?.naturalHeight;

                if (isFlipped) {
                    finalBlob = await getCroppedImg(
                        previewUrl,
                        null,
                        0,
                        null,
                        { horizontal: isFlipped, vertical: false }
                    );
                } else {
                    // Send current previewUrl (which might be rotated)
                   finalBlob = await fetch(previewUrl).then(r => r.blob());
                }
            }
            
            // [FIX] Ensure dimensions are present
            if (!finalWidth || !finalHeight) {
                console.log('[DEBUG] Dimensions missing, extracting from blob...');
                try {
                    const tempUrl = URL.createObjectURL(finalBlob);
                    const tempImg = new Image();
                    await new Promise(resolve => {
                        tempImg.onload = resolve;
                        tempImg.src = tempUrl;
                    });
                    finalWidth = tempImg.naturalWidth;
                    finalHeight = tempImg.naturalHeight;
                    URL.revokeObjectURL(tempUrl);
                    console.log('[DEBUG] Extracted dimensions:', finalWidth, 'x', finalHeight);
                } catch (err) {
                    console.error('[WARN] Failed to extract dimensions fallback:', err);
                }
            }
            
            // Convert HTML to plain text for sending
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Replace images with alt text
            const images = tempDiv.getElementsByTagName('img');
            while (images.length > 0) {
                const img = images[0];
                const alt = img.getAttribute('alt') || '';
                const textNode = document.createTextNode(alt);
                img.parentNode.replaceChild(textNode, img);
            }
            
            // cleanup divs/brs if any (basic implementation similar to MessageInput)
            let plainText = tempDiv.textContent || "";
            plainText = plainText.trim();

            console.log('[DEBUG] Calling onSend with:', finalWidth, 'x', finalHeight);
            onSend(finalBlob, plainText, finalWidth || 0, finalHeight || 0);
            resetState();
        } catch (e) {
            console.error('Processing error:', e);
            setIsProcessing(false);
        }
    };

    const toggleCrop = () => {
        setIsCropping(prev => {
            const newState = !prev;
            if (newState) {
                // Initialize default full crop if starting
                const img = imgRef.current;
                if(img) {
                     setCrop({
                        unit: '%',
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 100
                    });
                }
            }
            return newState;
        });
    };

    const toggleFlip = () => setIsFlipped(prev => !prev);

    const handleUndo = () => {
        resetState();
        if (file) {
            // Restore original image
            const objectUrl = URL.createObjectURL(file);
            setPreviewUrl(objectUrl);
        }
    };

    const handleDone = async () => {
        if (!previewUrl || isProcessing) return;
        
        // If simply exiting crop mode without a real crop, just toggle off
        if (isCropping && (!completedCrop?.width || !completedCrop?.height) && !isFlipped) {
            setIsCropping(false);
            return;
        }

        setIsProcessing(true);
        try {
            let finalBlob;
            
            // Calculate scale if cropping
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
                // No changes to apply?
                setIsCropping(false);
                setIsProcessing(false);
                return;
            }

            const newUrl = URL.createObjectURL(finalBlob);
            setPreviewUrl(newUrl);
            
            // Reset Edit States since they are now baked in
            setIsCropping(false);
            setIsFlipped(false);
            setCrop(null);
            setCompletedCrop(null);
            setIsRotated(true); // Mark as modified so Undo is available
            
        } catch (e) {
            console.error('Failed to apply edits', e);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!file) return null;

    return (
        <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center animate-in fade-in duration-200">
            <style>{`
                /* Custom styles for ReactCrop to match WhatsApp look */
                .ReactCrop__crop-selection {
                    border: 2px solid rgba(255, 255, 255, 0.8);
                }
                .ReactCrop__drag-handle {
                    width: 10px;
                    height: 10px;
                    background-color: white;
                    border: 1px solid rgba(0,0,0,0.2);
                }
                /* Hide default image when inside crop to avoid double render? No, ReactCrop wraps it. */
            `}</style>

            {/* HEADER */}
            <div className="w-full max-w-5xl p-4 flex items-center justify-between z-50 shrink-0">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleClose}
                        className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    {recipientAvatar ? (
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20">
                            <img src={recipientAvatar} alt={recipientName} className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-white/10">
                            {recipientName?.charAt(0) || '?'}
                        </div>
                    )}
                    <span className="text-white font-medium text-lg drop-shadow-md">{recipientName}</span>
                </div>

                {/* TOOLS */}
                <div className="flex items-center gap-2">
                    {(isFlipped || isRotated || completedCrop) && (
                        <button 
                            onClick={handleUndo} 
                            className="w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white rounded-full transition-all active:scale-95"
                            title="Undo Changes"
                        >
                            <span className="material-symbols-outlined">undo</span>
                        </button>
                    )}
                    
                    {/* Done Button (Visible when cropping or flipped) */}
                    {(isCropping || isFlipped) && (
                        <button 
                            onClick={handleDone} 
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full text-sm font-medium transition-all active:scale-95 shadow-lg"
                            title="Done"
                        >
                            Done
                        </button>
                    )}

                    <button 
                        onClick={toggleCrop} 
                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-95 ${isCropping ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                        title="Crop"
                    >
                        <span className="material-symbols-outlined">crop</span>
                    </button>
                    <button 
                        onClick={handleRotate} 
                        className="w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white rounded-full transition-all active:scale-95"
                        title="Rotate"
                    >
                        <span className="material-symbols-outlined">rotate_right</span>
                    </button>
                    <button 
                        onClick={toggleFlip} 
                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-95 ${isFlipped ? 'text-violet-400 hover:bg-slate-800' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                        title="Flip Horizontal"
                    >
                        <span className="material-symbols-outlined">flip</span>
                    </button>
                </div>
            </div>

            {/* MAIN PREVIEW AREA */}
            <div className="flex-1 w-full flex items-center justify-center p-4 pb-24 overflow-hidden min-h-0">
                {/* 
                    Crucial: We use previewUrl. 
                    If isCropping is TRUE, we wrap in ReactCrop.
                    If isCropping is FALSE, we just show the IMG.
                    This prevents the crop grid from being visible when not cropping.
                */}
                
                {isCropping ? (
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={undefined} // Freeform
                        className="max-h-full max-w-full"
                        style={{
                            maxHeight: '70vh',
                            maxWidth: '100%'
                        }}
                    >
                        <img 
                            ref={imgRef}
                            src={previewUrl}
                            alt="Preview"
                            className="max-h-[70vh] w-auto object-contain"
                            style={{ 
                                transform: isFlipped ? `scaleX(-1)` : 'none',
                                maxWidth: '100%',
                            }}
                            onLoad={(e) => {
                                 setImageDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
                            }}
                        />
                    </ReactCrop>
                ) : (
                    <img 
                        ref={imgRef}
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-[70vh] w-auto object-contain shadow-2xl transition-transform"
                        style={{ 
                            transform: isFlipped ? `scaleX(-1)` : 'none',
                            maxWidth: '100%',
                        }}
                        onLoad={(e) => {
                             setImageDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
                        }}
                    />
                )}
            </div>


            {/* CAPTION BAR */}
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-6 px-4 z-50">
                <div className="max-w-3xl mx-auto flex items-end gap-3">
                    <div className="flex-1 bg-slate-800/90 backdrop-blur-md rounded-2xl flex items-center border border-white/10 focus-within:border-violet-500/50 transition-colors shadow-lg relative min-h-[50px]">
                        <button 
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className={`pl-3 pr-2 py-3 h-full flex items-center justify-center text-slate-400 hover:text-yellow-400 transition-colors ${showEmojiPicker ? 'text-yellow-400' : ''}`}
                            type="button"
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
                                        
                                        // Simple append for now, or insert at cursor if we tracked it (ContentEditable usually inserts at end if not focused, but let's try to just append if not focused, or use execCommand if focused?)
                                        // Using execCommand 'insertHTML' is best if the div is focused. If not, we append.
                                        
                                        if (document.activeElement === inputRef.current) {
                                            document.execCommand('insertHTML', false, imageTag);
                                            setHtml(inputRef.current.innerHTML); // Sync state
                                        } else {
                                            // Append to end
                                            setHtml(prev => prev + imageTag);
                                        }
                                    }}
                                    lazyLoadEmojis={true}
                                    searchDisabled={false}
                                    skinTonesDisabled={true}
                                />
                            </div>
                        )}

                        {/* Input Wrapper for correct positioning */}
                        <div className="relative flex-1 min-w-0 h-full flex items-center">
                            <ContentEditable
                                innerRef={inputRef}
                                html={html}
                                onChange={(e) => {
                                    setHtml(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendClick();
                                    }
                                }}
                                className="w-full bg-transparent text-white border-0 focus:ring-0 outline-none focus:outline-none py-3 pr-4 pl-2 placeholder:text-slate-400 self-center max-h-[100px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar"
                                tagName="div"
                            />
                            {!(html.replace(/<[^>]*>/g, '').trim().length > 0 || html.includes('<img')) && (
                                <div className="absolute left-2 top-0 h-full flex items-center pointer-events-none text-slate-400 select-none">
                                    Add a caption...
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <button
                        onClick={handleSendClick}
                        disabled={isProcessing}
                        className="p-3 bg-violet-600 hover:bg-violet-700 text-white rounded-full shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center aspect-square"
                    >
                        {isProcessing ? (
                            <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
                        ) : (
                            <span className="material-symbols-outlined filled text-[24px]">send</span>
                        )}
                    </button>
                </div>
            </div>

        </div>
    );
}

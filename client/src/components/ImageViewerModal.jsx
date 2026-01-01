import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext'; // [NEW]
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import { linkifyText } from '../utils/linkify';

export default function ImageViewerModal({ images = [], startIndex = 0, onClose, onGoToMessage }) {
    const { token } = useAuth(); // [NEW] Use token
    // Normalize input to array
    const imageList = Array.isArray(images) ? images : [images];
    const initialIndex = Math.min(Math.max(0, startIndex), imageList.length - 1);

    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });

    const currentImage = imageList[currentIndex];

    // Reset zoom on index change
    useEffect(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, [currentIndex]);

    const handleWheel = (e) => {
        e.stopPropagation();
        setScale(prev => {
            const newScale = prev - e.deltaY * 0.001;
            return Math.min(Math.max(1, newScale), 5); // Limit zoom 1x to 5x
        });
    };

    const handleMouseDown = (e) => {
        if (scale > 1) {
            setIsDragging(true);
            setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging && scale > 1) {
            setPosition({
                x: e.clientX - startPos.x,
                y: e.clientY - startPos.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleNext = (e) => {
        e.stopPropagation();
        if (currentIndex < imageList.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handlePrev = (e) => {
        e.stopPropagation();
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const handleDownload = async () => {
        const url = currentImage.src || currentImage.url;
        
        try {
            // Fetch the image first
            const response = await fetch(url, {
                mode: 'cors',
                credentials: 'omit',
                cache: 'no-cache'
            });
            const blob = await response.blob();
            
            // Determine file extension
            const extension = blob.type.includes('png') ? 'png' : 
                             blob.type.includes('gif') ? 'gif' : 
                             blob.type.includes('webp') ? 'webp' : 
                             blob.type.includes('mp4') ? 'mp4' :
                             blob.type.includes('webm') ? 'webm' : 'jpg';
            
            // Try File System Access API (shows "site wants to save" dialog)
            if (typeof window.showSaveFilePicker === 'function') {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: `image-${currentIndex + 1}.${extension}`,
                        types: [{
                            description: 'Image',
                            accept: {
                                'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
                                'video/*': ['.mp4', '.webm']
                            }
                        }]
                    });
                    
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return; // Success
                } catch (apiErr) {
                    if (apiErr.name === 'AbortError') return; // User cancelled
                    console.log('File System API failed, using fallback:', apiErr.message);
                }
            }
            
            // Fallback: Regular download
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `image-${currentIndex + 1}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            
        } catch (error) {
            console.error('Download failed:', error);
            // Last resort fallback
            window.open(url, '_blank');
        }
    };

    // Touch state ref to avoid frequent re-renders during gesture
    const touchRef = useRef({
        lastDist: 0,
        startDist: 0,
        startX: 0,
        startY: 0,
        moveX: 0,
        moveY: 0,
        isPinching: false,
        isPanning: false
    });

    const getDistance = (touches) => {
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
    };

    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            // Pinch Start
            const dist = getDistance(e.touches);
            touchRef.current.startDist = dist;
            touchRef.current.lastDist = dist;
            touchRef.current.isPinching = true;
        } else if (e.touches.length === 1) {
            // Pan/Swipe Start
            touchRef.current.startX = e.touches[0].clientX;
            touchRef.current.startY = e.touches[0].clientY;
            touchRef.current.isPanning = true;
            
            if (scale > 1) {
                setStartPos({ 
                    x: e.touches[0].clientX - position.x, 
                    y: e.touches[0].clientY - position.y 
                });
            }
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && touchRef.current.isPinching) {
            // Pinch Move
            const dist = getDistance(e.touches);
            // Calculate scale change based on distance ratio
            // Sensitivity factor 0.005 is roughly uniform
            const delta = dist - touchRef.current.lastDist; 
            touchRef.current.lastDist = dist;

            setScale(prev => {
                const newScale = prev + (delta * 0.005);
                return Math.min(Math.max(1, newScale), 5);
            });
            e.preventDefault(); // Prevent default browser zoom
        } else if (e.touches.length === 1 && touchRef.current.isPanning) {
            if (scale > 1) {
                // Pan
                const x = e.touches[0].clientX - startPos.x;
                const y = e.touches[0].clientY - startPos.y;
                setPosition({ x, y });
                e.preventDefault();
            } else {
                 // Track Swipe (no visual feedback yet, just logic)
                 touchRef.current.moveX = e.touches[0].clientX;
                 touchRef.current.moveY = e.touches[0].clientY;
            }
        }
    };

    const handleTouchEnd = (e) => {
        if (touchRef.current.isPinching && e.touches.length < 2) {
            touchRef.current.isPinching = false;
        }
        
        if (touchRef.current.isPanning && !touchRef.current.isPinching) {
            touchRef.current.isPanning = false;
            
            // Check for swipe if scale is 1
            if (scale === 1 && touchRef.current.moveX !== 0) {
                const diffX = touchRef.current.startX - touchRef.current.moveX; // +ve means swipe left (next)
                const diffY = touchRef.current.startY - touchRef.current.moveY;
                
                // Threshold for swipe
                if (Math.abs(diffX) > 50 && Math.abs(diffY) < 50) {
                    if (diffX > 0) handleNext(e);
                    else handlePrev(e);
                }
            }
            
            // Reset move tracking
            touchRef.current.moveX = 0;
            touchRef.current.moveY = 0;
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') handleNext(e);
            if (e.key === 'ArrowLeft') handlePrev(e);
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, imageList.length]);

    if (!currentImage) return null;
    
    // Support object structure { src/url, alt/caption } or just string
    const imgSrc = currentImage.src || currentImage.url || currentImage;
    const imgAlt = currentImage.alt || currentImage.caption || "";

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-200 select-none h-[100dvh]" // h-100dvh for mobile
            onClick={onClose} 
        >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                 <div className="flex items-center gap-4 pointer-events-auto">
                     <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                     >
                         <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                     </button>
                     
                     {/* Sender Info - Only if available */}
                     {currentImage.senderName && (
                         <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-700 border border-white/10">
                                 {currentImage.senderAvatar ? (
                                     <img src={currentImage.senderAvatar} alt={currentImage.senderName} className="w-full h-full object-cover" />
                                 ) : (
                                     <div className="w-full h-full flex items-center justify-center text-white font-medium text-sm">
                                         {currentImage.senderName[0]?.toUpperCase()}
                                     </div>
                                 )}
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-white font-medium text-sm leading-tight flex items-center gap-1">
                                     {renderTextWithEmojis(currentImage.senderName)} 
                                     {currentImage.isMe && <span className="opacity-60 ml-0.5 mt-0.5 text-[10px]">(You)</span>}
                                 </span>
                                 <span className="text-white/60 text-xs">
                                     {new Date(currentImage.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                                 </span>
                             </div>
                         </div>
                     )}

                     {!currentImage.senderName && imageList.length > 1 && (
                         <span className="text-white/80 text-sm font-medium">
                            {currentIndex + 1} / {imageList.length}
                         </span>
                     )}
                 </div>

                 <div className="flex items-center gap-2 pointer-events-auto">
                     {/* Go to Message */}
                     {currentImage.messageId && onGoToMessage && (
                         <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onGoToMessage(currentImage.messageId);
                                onClose();
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors mr-2"
                            title="Go to Message"
                         >
                             <span className="material-symbols-outlined text-[20px]">chat</span>
                             <span className="text-xs font-medium hidden sm:inline">Show in Chat</span>
                         </button>
                     )}

                     <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            handleDownload();
                        }}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                        title="Download"
                     >
                         <span className="material-symbols-outlined text-[24px]">download</span>
                     </button>
                 </div>
            </div>

            {/* Navigation Buttons - Hidden on Touch Devices (optional, but good for cleanliness if swipe works) - Keeping visible for now but maybe adapt based on user agent or just CSS */}
            {imageList.length > 1 && (
                <>
                    <button
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                        className={`absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all z-50 pointer-events-auto hidden md:flex ${currentIndex === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    >
                        <span className="material-symbols-outlined text-[32px]">chevron_left</span>
                    </button>
                    <button
                        onClick={handleNext}
                        disabled={currentIndex === imageList.length - 1}
                        className={`absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all z-50 pointer-events-auto hidden md:flex ${currentIndex === imageList.length - 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    >
                        <span className="material-symbols-outlined text-[32px]">chevron_right</span>
                    </button>
                </>
            )}

            {/* Image Area */}
            <div 
                className="flex-1 flex items-center justify-center overflow-hidden w-full h-full relative py-12 px-4"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {imgSrc.match(/\.(mp4|webm)$/i) ? (
                    <video
                        src={imgSrc}
                        className="max-w-full max-h-full object-contain transition-transform duration-75 ease-linear origin-center touch-none"
                        style={{ 
                            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoPlay
                        loop
                        muted
                        playsInline
                        controls
                    />
                ) : (
                    <img 
                        src={imgSrc} 
                        alt={imgAlt} 
                        className="max-w-full max-h-full object-contain transition-transform duration-75 ease-linear origin-center touch-none" // touch-none is key
                        style={{ 
                            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                        }}
                        onClick={(e) => e.stopPropagation()} 
                        draggable={false} // Prevent native drag
                    />
                )}
            </div>

            {/* Thumbnails Strip - Hide when zoomed */}
            {imageList.length > 1 && scale === 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center z-[60] pointer-events-none animate-in slide-in-from-bottom-4 duration-300">
                    <div 
                        className="flex gap-2 p-2 bg-black/40 backdrop-blur-md rounded-2xl overflow-x-auto max-w-[90vw] pointer-events-auto scrollbar-hide no-scrollbar"
                        ref={(el) => {
                            // Auto-scroll logic
                            if (el && imageList.length > 0) {
                                const activeThumb = el.children[currentIndex];
                                if (activeThumb) {
                                    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                                }
                            }
                        }}
                    >
                        {imageList.map((img, idx) => (
                           <button
                                key={idx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentIndex(idx);
                                }}
                                className={`
                                    relative flex-shrink-0 w-12 h-12 md:w-16 md:h-16 rounded-lg overflow-hidden border-2 transition-all duration-200
                                    ${currentIndex === idx ? 'border-white scale-105' : 'border-transparent opacity-60 hover:opacity-100'}
                                `}
                           >
                               <img 
                                   src={img.src || img.url || img} 
                                   alt="" 
                                   className="w-full h-full object-cover" 
                               />
                           </button> 
                        ))}
                    </div>
                </div>
            )}

            {/* Caption Footer */}
            {imgAlt && (
                <div 
                    className={`absolute left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white text-center z-50 transition-opacity pointer-events-auto ${imageList.length > 1 && scale === 1 ? 'bottom-24 md:bottom-28' : 'bottom-0'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-base font-medium whitespace-pre-wrap max-h-[20vh] overflow-y-auto text-shadow-sm">
                        {linkifyText(imgAlt)}
                    </p>
                </div>
            )}
        </div>,
        document.body
    );
}

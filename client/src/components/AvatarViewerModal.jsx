import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

/**
 * AvatarViewerModal - Profile/Group avatar viewer with hero animation
 * Opens with an animation from the source element and closes back to it
 * Supports zoom (wheel, pinch, double-click) and pan when zoomed
 */
export default function AvatarViewerModal({ 
    src, 
    alt = "Photo", 
    onClose,
    sourceRect // { top, left, width, height } of the source element
}) {
    const [phase, setPhase] = useState('hidden'); // 'hidden' | 'entering' | 'open' | 'exiting'
    const [imageStyle, setImageStyle] = useState({});
    const containerRef = useRef(null);
    const imageRef = useRef(null);
    const hasInitialized = useRef(false);

    // Zoom and pan state
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const lastTapTime = useRef(0);

    // Touch pinch state
    const touchRef = useRef({
        lastDist: 0,
        isPinching: false,
        startX: 0,
        startY: 0
    });

    // Use layoutEffect for synchronous positioning before paint
    useLayoutEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        if (!sourceRect) {
            // Fallback: just do a simple fade in if no source rect
            setImageStyle({
                position: 'fixed',
                top: '50%',
                left: '50%',
                width: Math.min(window.innerWidth * 0.9, window.innerHeight * 0.85),
                height: Math.min(window.innerWidth * 0.9, window.innerHeight * 0.85),
                borderRadius: '16px',
                transform: 'translate(-50%, -50%)',
                opacity: 1
            });
            setPhase('open');
            return;
        }

        // Set initial style synchronously - positioned at source, hidden
        setImageStyle({
            position: 'fixed',
            top: sourceRect.top,
            left: sourceRect.left,
            width: sourceRect.width,
            height: sourceRect.height,
            borderRadius: '50%',
            transform: 'none',
            opacity: 1,
            transition: 'none'
        });
        setPhase('entering');
    }, [sourceRect]);

    // Animate to open state after initial position is set
    useEffect(() => {
        if (phase !== 'entering') return;

        // Use a small timeout to ensure the initial style is painted first
        const timer = setTimeout(() => {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const maxWidth = viewportWidth * 0.9;
            const maxHeight = viewportHeight * 0.85;
            const finalSize = Math.min(maxWidth, maxHeight);

            setImageStyle({
                position: 'fixed',
                top: '50%',
                left: '50%',
                width: finalSize,
                height: finalSize,
                borderRadius: '16px',
                transform: 'translate(-50%, -50%)',
                opacity: 1,
                transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0, 1)'
            });
            setPhase('open');
        }, 20);

        return () => clearTimeout(timer);
    }, [phase]);

    const handleClose = () => {
        if (phase === 'exiting') return;
        
        // Reset zoom before closing
        if (scale !== 1) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }

        if (!sourceRect) {
            onClose();
            return;
        }

        setPhase('exiting');
        
        // Animate back to source
        setImageStyle({
            position: 'fixed',
            top: sourceRect.top,
            left: sourceRect.left,
            width: sourceRect.width,
            height: sourceRect.height,
            borderRadius: '50%',
            transform: 'none',
            opacity: 1,
            transition: 'all 0.28s cubic-bezier(0.32, 0.72, 0, 1)'
        });
        
        // Close after animation
        setTimeout(() => {
            onClose();
        }, 280);
    };

    // Mouse wheel zoom
    const handleWheel = (e) => {
        if (phase !== 'open') return;
        e.preventDefault();
        e.stopPropagation();
        
        setScale(prev => {
            const delta = e.deltaY > 0 ? -0.15 : 0.15;
            const newScale = Math.min(Math.max(1, prev + delta), 5);
            
            // Reset position when zooming back to 1
            if (newScale === 1) {
                setPosition({ x: 0, y: 0 });
            }
            
            return newScale;
        });
    };

    // Double click/tap to toggle zoom
    const handleDoubleClick = (e) => {
        if (phase !== 'open') return;
        e.stopPropagation();
        
        if (scale > 1) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        } else {
            setScale(2.5);
        }
    };

    // Mouse drag for panning
    const handleMouseDown = (e) => {
        if (phase !== 'open' || scale <= 1) return;
        e.preventDefault();
        setIsDragging(true);
        dragStart.current = { 
            x: e.clientX - position.x, 
            y: e.clientY - position.y 
        };
    };

    const handleMouseMove = (e) => {
        if (!isDragging || scale <= 1) return;
        setPosition({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Touch handlers for pinch zoom and pan
    const getDistance = (touches) => {
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
    };

    const handleTouchStart = (e) => {
        if (phase !== 'open') return;

        if (e.touches.length === 2) {
            // Pinch start
            const dist = getDistance(e.touches);
            touchRef.current.lastDist = dist;
            touchRef.current.isPinching = true;
        } else if (e.touches.length === 1) {
            // Check for double tap
            const now = Date.now();
            if (now - lastTapTime.current < 300) {
                handleDoubleClick(e);
                lastTapTime.current = 0;
                return;
            }
            lastTapTime.current = now;

            // Pan start
            if (scale > 1) {
                touchRef.current.startX = e.touches[0].clientX - position.x;
                touchRef.current.startY = e.touches[0].clientY - position.y;
                setIsDragging(true);
            }
        }
    };

    const handleTouchMove = (e) => {
        if (phase !== 'open') return;

        if (e.touches.length === 2 && touchRef.current.isPinching) {
            e.preventDefault();
            const dist = getDistance(e.touches);
            const delta = (dist - touchRef.current.lastDist) * 0.01;
            touchRef.current.lastDist = dist;

            setScale(prev => {
                const newScale = Math.min(Math.max(1, prev + delta), 5);
                if (newScale === 1) {
                    setPosition({ x: 0, y: 0 });
                }
                return newScale;
            });
        } else if (e.touches.length === 1 && isDragging && scale > 1) {
            setPosition({
                x: e.touches[0].clientX - touchRef.current.startX,
                y: e.touches[0].clientY - touchRef.current.startY
            });
        }
    };

    const handleTouchEnd = () => {
        touchRef.current.isPinching = false;
        setIsDragging(false);
    };

    // Keyboard handler
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [sourceRect, phase, scale]);

    // Download handler
    const handleDownload = async () => {
        try {
            const response = await fetch(src, {
                mode: 'cors',
                credentials: 'omit',
                cache: 'no-cache'
            });
            const blob = await response.blob();
            
            const extension = blob.type.includes('png') ? 'png' : 
                             blob.type.includes('gif') ? 'gif' : 
                             blob.type.includes('webp') ? 'webp' : 'jpg';
            
            if (typeof window.showSaveFilePicker === 'function') {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: `profile-photo.${extension}`,
                        types: [{
                            description: 'Image',
                            accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] }
                        }]
                    });
                    
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return;
                } catch (apiErr) {
                    if (apiErr.name === 'AbortError') return;
                }
            }
            
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `profile-photo.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            window.open(src, '_blank');
        }
    };

    // Don't render anything until we're ready
    if (phase === 'hidden') {
        return null;
    }

    const isOpen = phase === 'open';
    const isExiting = phase === 'exiting';

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex flex-col select-none h-[100dvh]"
            style={{ 
                backgroundColor: isOpen ? 'rgba(0,0,0,0.95)' : isExiting ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0)',
                backdropFilter: isOpen ? 'blur(8px)' : 'blur(0px)',
                transition: 'background-color 0.35s ease, backdrop-filter 0.35s ease'
            }}
            onClick={() => scale === 1 && handleClose()}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            ref={containerRef}
        >
            {/* Header */}
            <div 
                className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none"
                style={{
                    opacity: isOpen && scale === 1 ? 1 : 0,
                    transition: 'opacity 0.25s ease',
                    transitionDelay: isOpen ? '0.1s' : '0s'
                }}
            >
                <div className="flex items-center gap-4 pointer-events-auto">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleClose(); }}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[24px]">close</span>
                    </button>
                    <span className="text-white/90 font-medium">{renderTextWithEmojis(alt)}</span>
                </div>

                <div className="flex items-center gap-2 pointer-events-auto">
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

            {/* Zoom indicator */}
            {scale > 1 && isOpen && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white/90 text-sm font-medium pointer-events-none">
                    {Math.round(scale * 100)}%
                </div>
            )}

            {/* Image with hero animation and zoom/pan */}
            <div 
                ref={imageRef}
                className="overflow-hidden shadow-2xl touch-none"
                style={{
                    ...imageStyle,
                    cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={handleDoubleClick}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <img 
                    src={src} 
                    alt={alt}
                    className="w-full h-full object-cover origin-center"
                    style={{
                        transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                    }}
                    draggable={false}
                />
            </div>
        </div>,
        document.body
    );
}

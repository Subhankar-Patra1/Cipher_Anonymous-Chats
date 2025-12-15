import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function ImageViewerModal({ imageUrl, caption, onClose, onDownload }) {
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });

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
    
    // Reset zoom on close or image change
    useEffect(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, [imageUrl]);

    if (!imageUrl) return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-200"
            onClick={onClose} // Close on backdrop click
        >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/50 to-transparent">
                 <div className="flex items-center gap-4">
                     <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                     >
                         <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                     </button>
                     {/* User info header could go here like WhatsApp */}
                 </div>
                 <div className="flex items-center gap-2">
                     <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if (onDownload) onDownload(); 
                            else {
                                const a = document.createElement('a');
                                a.href = imageUrl;
                                a.download = 'image.png'; // Fallback
                                a.click();
                            }
                        }}
                        className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                        title="Download"
                     >
                         <span className="material-symbols-outlined text-[24px]">download</span>
                     </button>
                 </div>
            </div>

            {/* Image Area */}
            <div 
                className="flex-1 flex items-center justify-center overflow-hidden w-full h-full relative"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <img 
                    src={imageUrl} 
                    alt="Full View" 
                    className="max-w-full max-h-full object-contain transition-transform duration-75 ease-linear origin-center"
                    style={{ 
                        transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                    }}
                    onClick={(e) => e.stopPropagation()} // Prevent close on image click (unless distinct behavior desired)
                />
            </div>

            {/* Caption Footer */}
            {caption && (
                <div 
                    className="absolute bottom-0 left-0 right-0 p-6 bg-black/60 text-white text-center backdrop-blur-sm z-50 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-base font-medium">{caption}</p>
                </div>
            )}
        </div>,
        document.body
    );
}

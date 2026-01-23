import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function PhotoGalleryModal({ 
    isOpen, 
    onClose, 
    userId, 
    photos: initialPhotos = [],
    isMe = false,
    onAddPhoto,
    onDeletePhoto,
    onSetMainPhoto
}) {
    const [photos, setPhotos] = useState(initialPhotos);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [startPan, setStartPan] = useState({ x: 0, y: 0 });

    useEffect(() => {
        setPhotos(initialPhotos);
    }, [initialPhotos]);

    useEffect(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });

        // [NEW] Preload next and previous images for instant/smooth transitions
        if (photos.length > 1) {
            const nextIndex = currentIndex < photos.length - 1 ? currentIndex + 1 : 0;
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : photos.length - 1;
            
            const preload = (url) => {
                const img = new Image();
                img.src = url;
            };

            preload(photos[nextIndex].photo_url);
            preload(photos[prevIndex].photo_url);
        }
    }, [currentIndex, photos]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') navigatePrev();
            if (e.key === 'ArrowRight') navigateNext();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentIndex, photos.length]);

    const navigatePrev = () => {
        setCurrentIndex(prev => prev > 0 ? prev - 1 : photos.length - 1);
    };

    const navigateNext = () => {
        setCurrentIndex(prev => prev < photos.length - 1 ? prev + 1 : 0);
    };

    const handleZoomIn = (e) => {
        e.stopPropagation();
        setZoom(prev => Math.min(prev + 0.5, 4));
    };

    const handleZoomOut = (e) => {
        e.stopPropagation();
        setZoom(prev => {
            const newZoom = Math.max(1, prev - 0.5);
            if (newZoom === 1) setPan({ x: 0, y: 0 });
            return newZoom;
        });
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        const photoToDelete = photos[currentIndex];
        
        // Call parent handler
        if (onDeletePhoto) onDeletePhoto(photoToDelete.id);

        const newPhotos = photos.filter((_, index) => index !== currentIndex);
        
        // If deleted photo was main, set the new first photo as main
        if (photoToDelete.is_main && newPhotos.length > 0) {
            newPhotos[0].is_main = true;
            if (onSetMainPhoto) onSetMainPhoto(newPhotos[0].id);
        }

        setPhotos(newPhotos);
        if (newPhotos.length === 0) {
            onClose();
        } else {
            setCurrentIndex(prev => prev >= newPhotos.length ? newPhotos.length - 1 : prev);
        }
    };

    const handleSetMain = (e) => {
        e.stopPropagation();
        const currentPhoto = photos[currentIndex];
        if (currentPhoto.is_main) return;

        // Call parent handler
        if (onSetMainPhoto) onSetMainPhoto(currentPhoto.id);

        // Update local state: Make current main, others not main, and move to start
        const updatedPhotos = photos.map(p => ({
            ...p,
            is_main: p.id === currentPhoto.id
        }));

        const mainPhoto = updatedPhotos.find(p => p.id === currentPhoto.id);
        const otherPhotos = updatedPhotos.filter(p => p.id !== currentPhoto.id);
        
        setPhotos([mainPhoto, ...otherPhotos]);
        setCurrentIndex(0);
    };

    const handleWheel = (e) => {
        e.stopPropagation();
        const delta = e.deltaY * -0.005;
        const newZoom = Math.min(Math.max(1, zoom + delta), 4);
        setZoom(newZoom);
        if (newZoom === 1) setPan({ x: 0, y: 0 });
    };

    const handleMouseDown = (e) => {
        if (zoom > 1) {
            e.preventDefault();
            setIsDragging(true);
            setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging && zoom > 1) {
            e.preventDefault();
            setPan({
                x: e.clientX - startPan.x,
                y: e.clientY - startPan.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    if (!isOpen || photos.length === 0) return null;

    const currentPhoto = photos[currentIndex];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Content */}
            <div 
                className="relative z-10 w-full h-full flex flex-col"
                onClick={(e) => !e.target.closest('button') && !e.target.closest('img') && onClose()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
                    <div className="text-white">
                        <span className="font-medium">{currentIndex + 1}</span>
                        <span className="text-white/60"> of {photos.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isMe && (
                            <>
                                {!currentPhoto.is_main && (
                                    <button
                                        onClick={handleSetMain}
                                        title="Set as Main Photo"
                                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                                    >
                                        <span className="material-symbols-outlined">collections</span>
                                    </button>
                                )}
                                <button
                                    onClick={handleDelete}
                                    title="Delete Photo"
                                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                            </>
                        )}
                        <button
                            onClick={handleZoomOut}
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                            disabled={zoom <= 1}
                        >
                            <span className="material-symbols-outlined">remove</span>
                        </button>
                        <button
                            onClick={handleZoomIn}
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                            disabled={zoom >= 4}
                        >
                            <span className="material-symbols-outlined">add</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                {/* Main Image */}
                <div className="flex-1 flex items-center justify-center relative px-4 min-h-0 overflow-hidden">
                    {/* Previous Button */}
                    {photos.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); navigatePrev(); }}
                            className="absolute left-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-20"
                        >
                            <span className="material-symbols-outlined text-[28px]">chevron_left</span>
                        </button>
                    )}

                    {/* Image Container with handlers */}
                    <div 
                        className="w-full h-full flex items-center justify-center relative p-4"
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="relative h-[75vh] aspect-square max-w-[90vw] max-h-[90vw] flex items-center justify-center overflow-hidden rounded-lg shadow-2xl bg-black/50">
                            <img
                                src={currentPhoto.photo_url}
                                alt={`Photo ${currentIndex + 1}`}
                                className={`block w-full h-full object-cover ${isDragging ? 'duration-0' : 'transition-transform duration-300 ease-out'}`}
                                style={{ 
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, 
                                    cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' 
                                }}
                                draggable={false}
                            />
                            {currentPhoto.is_main && zoom === 1 && (
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-violet-500/90 backdrop-blur-sm rounded-full text-white text-sm font-medium flex items-center gap-2 pointer-events-none">
                                    <span className="material-symbols-outlined text-[16px]">star</span>
                                    Main Photo
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Next Button */}
                    {photos.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); navigateNext(); }}
                            className="absolute right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-20"
                        >
                            <span className="material-symbols-outlined text-[28px]">chevron_right</span>
                        </button>
                    )}
                </div>

                {/* Thumbnails */}
                {photos.length > 1 && (
                    <div className="shrink-0 flex items-center justify-center gap-2 p-4 pb-8 z-20 transition-all duration-300">
                        {photos.map((photo, index) => (
                            <button
                                key={photo.id}
                                onClick={() => setCurrentIndex(index)}
                                className={`relative w-16 h-16 rounded-md overflow-hidden transition-all ${
                                    index === currentIndex 
                                        ? 'ring-2 ring-violet-500' 
                                        : 'opacity-60 hover:opacity-100'
                                }`}
                            >
                                <img
                                    src={photo.thumb_url}
                                    alt={`Thumbnail ${index + 1}`}
                                    className={`w-full h-full object-cover transition-transform duration-300 ${
                                        index === currentIndex ? 'scale-110' : 'scale-100'
                                    }`}
                                />
                                {photo.is_main && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-violet-500/80 py-0.5">
                                        <span className="material-symbols-outlined text-white text-[12px]">star</span>
                                    </div>
                                )}
                            </button>
                        ))}
                        
                        {/* Add Photo Button (only for own profile) */}
                        {isMe && (
                            <button
                                onClick={() => {
                                    onClose();
                                    if (onAddPhoto) onAddPhoto();
                                }}
                                className="w-16 h-16 rounded-md border-2 border-dashed border-white/30 hover:border-white/60 flex items-center justify-center text-white/60 hover:text-white/90 transition-all"
                            >
                                <span className="material-symbols-outlined text-[24px]">add</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

import React, { useState, useRef, useEffect } from 'react';

// Global cache for static frames - persists across component mounts
const frameCache = new Map();

const BigAnimatedEmoji = ({ url, alt, size = 160, autoPlay = false }) => {
    const [error, setError] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [staticFrame, setStaticFrame] = useState(() => frameCache.get(url) || null);
    const [isReady, setIsReady] = useState(() => frameCache.has(url));
    const [animKey, setAnimKey] = useState(0);
    const imgRef = useRef(null);
    const timerRef = useRef(null);
    const hasAutoPlayedRef = useRef(false);

    const ANIMATION_DURATION = 3000;

    // Capture first frame in background (only if not already cached)
    useEffect(() => {
        if (frameCache.has(url)) {
            setStaticFrame(frameCache.get(url));
            setIsReady(true);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const captureSize = Math.max(img.naturalWidth, img.naturalHeight, size * 2);
                canvas.width = captureSize;
                canvas.height = captureSize;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, captureSize, captureSize);
                const dataUrl = canvas.toDataURL('image/png', 1.0);
                frameCache.set(url, dataUrl); // Cache it
                setStaticFrame(dataUrl);
                setIsReady(true);
            } catch (e) {
                setIsReady(true);
            }
        };
        img.onerror = () => {
            setError(true);
            setIsReady(true);
        };
        img.src = url;
    }, [url, size]);

    // Handle autoPlay
    useEffect(() => {
        if (autoPlay && isReady && !hasAutoPlayedRef.current) {
            setIsPlaying(true);
            hasAutoPlayedRef.current = true;
        }
    }, [autoPlay, isReady]);

    // Stop animation after duration
    useEffect(() => {
        if (isPlaying) {
            timerRef.current = setTimeout(() => {
                setIsPlaying(false);
            }, ANIMATION_DURATION);
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isPlaying, animKey]);

    const handleClick = () => {
        if (isReady) {
            setAnimKey(prev => prev + 1);
            setIsPlaying(true);
            // Reset autoPlay ref so it can be manually re-played if needed
            // Actually, handleClick should just force play
        }
    };

    // Show nothing until ready
    if (!isReady) {
        return (
            <div 
                style={{ width: `${size}px`, height: `${size}px` }}
                className="flex items-center justify-center"
            />
        );
    }

    if (error) {
        return (
            <span 
                style={{ fontSize: '80px', lineHeight: '1' }}
                className="select-none cursor-pointer"
                onClick={handleClick}
            >
                {alt}
            </span>
        );
    }

    return (
        <div 
            className="cursor-pointer select-none"
            onClick={handleClick}
            style={{ width: `${size}px`, height: `${size}px` }}
        >
            {isPlaying ? (
                <img 
                    ref={imgRef}
                    key={animKey}
                    src={`${url}?t=${animKey}`}
                    alt={alt}
                    crossOrigin="anonymous"
                    className="object-contain drop-shadow-sm"
                    style={{ width: `${size}px`, height: `${size}px` }}
                    draggable="false"
                    onError={() => setError(true)}
                />
            ) : (
                <img 
                    src={staticFrame}
                    alt={alt}
                    className="object-contain drop-shadow-sm hover:scale-105 transition-transform duration-200"
                    style={{ width: `${size}px`, height: `${size}px` }}
                    draggable="false"
                />
            )}
        </div>
    );
};

export default BigAnimatedEmoji;

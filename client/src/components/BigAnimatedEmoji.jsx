import React, { useState } from 'react';

const BigAnimatedEmoji = ({ url, alt, size = 160, autoPlay = true }) => {
    const [error, setError] = useState(false);

    if (error) {
        // Fallback to Apple emoji image
        const hex = Array.from(alt)
            .map(c => c.codePointAt(0).toString(16))
            .filter(h => h !== 'fe0f')
            .join('-');
        
        return (
            <img 
                src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`}
                alt={alt}
                className="select-none drop-shadow-md object-contain"
                style={{ width: `${size}px`, height: `${size}px` }}
                draggable="false"
            />
        );
    }

    return (
        <img 
            src={url}
            alt={alt}
            className="select-none drop-shadow-md object-contain"
            style={{ width: `${size}px`, height: `${size}px` }}
            draggable="false"
            onError={() => setError(true)}
        />
    );
};

export default BigAnimatedEmoji;

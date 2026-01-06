import React, { useState } from 'react';

const BigAnimatedEmoji = ({ url, alt, size = 160 }) => {
    const [error, setError] = useState(false);

    if (error) {
        return <span style={{ fontSize: '80px', lineHeight: '1' }}>{alt}</span>;
    }

    return (
        <img 
            src={url} 
            alt={alt}
            className="select-none pointer-events-none object-contain drop-shadow-sm hover:scale-110 transition-transform duration-200"
            style={{ 
                width: `${size}px`, 
                height: `${size}px`,
            }}
            draggable="false"
            onError={() => setError(true)}
        />
    );
};

export default BigAnimatedEmoji;

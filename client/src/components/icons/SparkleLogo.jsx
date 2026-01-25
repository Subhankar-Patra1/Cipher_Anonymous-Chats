import React from 'react';

export default function SparkleLogo({ className = "w-6 h-6", white = false }) {
    const id = React.useId();
    const gradientId = `sparkle-gradient-${id}`;
    
    return (
        <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg" 
            className={className}
        >
            {!white && (
                <defs>
                    <linearGradient id={gradientId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#d946ef" /> {/* Fuchsia-500 - Darker/Vibrant */}
                        <stop offset="50%" stopColor="#a855f7" /> {/* Purple-500 */}
                        <stop offset="100%" stopColor="#7c3aed" /> {/* Violet-600 */}
                    </linearGradient>
                </defs>
            )}
            <path 
                d="M12 2L14.39 9.61L22 12L14.39 14.39L12 22L9.61 14.39L2 12L9.61 9.61L12 2Z" 
                fill={white ? "#ffffff" : `url(#${gradientId})`} 
                className="drop-shadow-sm"
            />
        </svg>
    );
}


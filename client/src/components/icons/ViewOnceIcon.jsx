import React from 'react';

const ViewOnceIcon = ({ className = "w-4 h-4", isOpened = false }) => {
    return (
        <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg" 
            className={`${className} shrink-0`}
        >
            {/* Left solid arc */}
            <path 
                d="M12 22 A10 10 0 0 1 12 2" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
            />
            {/* Right dashed/dotted arc */}
            <path 
                d="M12 2 A10 10 0 0 1 12 22" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeDasharray="5 3" 
                strokeLinecap="round" 
                opacity={isOpened ? 0.5 : 1}
            />
            {!isOpened && (
                <path 
                   d="M10.5 9L12 7.5V16.5" 
                   stroke="currentColor" 
                   strokeWidth="2.5" 
                   strokeLinecap="round" 
                   strokeLinejoin="round" 
                />
            )}
        </svg>
    );
};

export default ViewOnceIcon;

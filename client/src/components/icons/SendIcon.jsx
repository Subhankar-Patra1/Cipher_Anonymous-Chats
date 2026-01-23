import React from 'react';

export default function SendIcon({ className = "w-6 h-6" }) {
    return (
        <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg" 
            className={className}
        >
            {/* Fixed: Changed translate(1, -1) to translate(-2, -1) 
               -2 moves it LEFT (centering it horizontally)
               -1 moves it UP (centering it vertically)
            */}
            <g transform="translate(-1, 0)">
                <path 
                    d="M7.39969 6.32015L15.8897 3.49015C19.6997 2.22015 21.7697 4.30015 20.5097 8.11015L17.6797 16.6002C15.7797 22.3102 12.6597 22.3102 10.7597 16.6002L9.91969 14.0802L7.39969 13.2402C1.69969 11.3402 1.69969 8.23015 7.39969 6.32015Z" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                />
                <path 
                    d="M10.1104 13.6501L13.6904 10.0601" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                />
            </g>
        </svg>
    );
}
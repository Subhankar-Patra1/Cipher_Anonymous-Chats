import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip Component
 * 
 * Renders a tooltip relative to its trigger element.
 * 
 * @param {ReactNode} children - The trigger element (e.g., button, icon)
 * @param {string} text - The tooltip content
 * @param {string} position - 'right' | 'left' | 'top' | 'bottom'
 * @param {string} className - Additional classes for trigger wrapper
 */
export default function Tooltip({ children, text, position = 'right', className = '' }) {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    const handleMouseEnter = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        
        let top = 0;
        let left = 0;
        const gap = 4; // reduced gap for tighter look

        // Calculate position based on placement
        // Default logic for 'right' placement (as needed for SideNav)
        if (position === 'right') {
            top = rect.top + rect.height / 2; // centered vertically relative to trigger
            left = rect.right + gap;
        } else if (position === 'left') {
            top = rect.top + rect.height / 2;
            left = rect.left - gap;
        } else if (position === 'top') {
            top = rect.top - gap;
            left = rect.left + rect.width / 2;
        } else if (position === 'bottom') {
            top = rect.bottom + gap;
            left = rect.left + rect.width / 2;
        }

        setCoords({ top, left });
        setIsVisible(true);
    };

    const handleMouseLeave = () => {
        setIsVisible(false);
    };

    return (
        <div 
            className={`relative flex items-center justify-center ${className}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            
            {isVisible && text && createPortal(
                <div 
                    className="fixed z-[9999] pointer-events-none"
                    style={{ 
                        top: coords.top, 
                        left: coords.left,
                        transform: position === 'right' ? 'translateY(-50%)' :
                                   position === 'left' ? 'translate(-100%, -50%)' :
                                   position === 'top' ? 'translate(-50%, -100%)' :
                                   'translate(-50%, 0)'
                    }}
                >
                    <div className="animate-tooltip-in bg-slate-800 text-white text-xs font-medium px-2 py-1.5 rounded-md shadow-lg border border-slate-700/50 whitespace-nowrap">
                        {text}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// Add this to your globals.css or Tailwind config if not present:
// @keyframes fade-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
// .animate-fade-in { animation: fade-in 0.15s ease-out forwards; }

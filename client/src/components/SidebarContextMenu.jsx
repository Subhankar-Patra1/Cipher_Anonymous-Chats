import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SidebarContextMenu({ x, y, options, onClose }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: y, left: x, opacity: 0 });

  useEffect(() => {
    // Basic collision detection
    if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let newLeft = x;
        let newTop = y;

        // Clip right
        if (x + rect.width > winWidth) {
            newLeft = x - rect.width;
        }

        // Clip bottom
        if (y + rect.height > winHeight) {
            newTop = y - rect.height;
        }
        
        setPosition({ top: newTop, left: newLeft, opacity: 1 });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    // Use mousedown to capture earlier
    document.addEventListener('mousedown', handleClickOutside);
    // Also Close on window resize
    window.addEventListener('resize', onClose);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-2xl py-1.5 min-w-[160px] transform transition-all duration-200 scale-100 origin-top-left"
      style={{
        top: position.top,
        left: position.left,
        opacity: position.opacity, // Prevent flash of misplaced content
      }}
    >
      {options.map((option, index) => (
        <button
          key={index}
          onClick={(e) => {
             e.stopPropagation();
             option.onClick();
             onClose();
          }}
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 rounded-lg mx-1 my-0.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${
            option.danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-slate-700 dark:text-slate-200'
          }`}
          style={{ width: 'calc(100% - 8px)' }}
        >
          {option.icon && <span className="material-symbols-outlined text-[18px] opacity-80">{option.icon}</span>}
          <span className="font-medium">{option.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

import React from 'react';

export default function UnreadDivider({ id, count, isExiting }) {
    return (
        <div id={id} className={`flex justify-center my-4 transition-all duration-2000 ease-in-out ${
            isExiting 
                ? 'opacity-0 scale-105 blur-sm h-0 my-0 overflow-hidden' 
                : 'opacity-100 scale-100 blur-0 h-auto animate-in fade-in slide-in-from-top-2'
        }`}>
            <div className="bg-slate-200/80 dark:bg-slate-700/80 backdrop-blur-md px-4 py-1 rounded-full shadow-sm border border-white/20 dark:border-slate-600/30">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {count} Unread Message{count !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    );
};

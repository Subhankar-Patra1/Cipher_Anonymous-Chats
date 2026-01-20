import React from 'react';

export default function ChatSkeleton() {
    return (
        <div className="flex-1 relative min-h-0 w-full overflow-hidden">
            <div className="w-full h-full p-4 sm:p-6 flex flex-col gap-4">
                {/* Fake Message Bubbles */}
                {[...Array(6)].map((_, i) => (
                    <div 
                        key={i} 
                        className={`flex flex-col gap-1 max-w-[60%] animate-pulse ${
                            i % 2 === 0 ? 'self-start' : 'self-end items-end'
                        }`}
                    >
                        {/* Bubble */}
                        <div 
                            className={`h-12 rounded-2xl ${
                                i % 2 === 0 
                                    ? 'bg-slate-200 dark:bg-slate-800 rounded-tl-sm' 
                                    : 'bg-slate-200 dark:bg-slate-800/80 rounded-tr-sm'
                            }`}
                            style={{ width: `${Math.random() * 100 + 100}px` }}
                        />
                        {/* Tiny Timestamp */}
                        <div className="h-3 w-10 bg-slate-200 dark:bg-slate-800 rounded-full opacity-60" />
                    </div>
                ))}
            </div>
        </div>
    );
}

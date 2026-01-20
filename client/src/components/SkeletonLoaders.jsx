import React from 'react';

// Shimmer animation is defined in index.css

// Generic skeleton base
const SkeletonBase = ({ className = '', style = {} }) => (
    <div 
        className={`bg-slate-200 dark:bg-slate-700 rounded animate-shimmer ${className}`}
        style={{
            backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
            backgroundSize: '200% 100%',
            ...style
        }}
    />
);

// Chat list item skeleton
export function ChatListSkeleton({ count = 5 }) {
    return (
        <div className="space-y-1 p-2">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                    {/* Avatar */}
                    <SkeletonBase className="w-12 h-12 rounded-full shrink-0" />
                    
                    {/* Content */}
                    <div className="flex-1 space-y-2">
                        {/* Name */}
                        <SkeletonBase 
                            className="h-4 rounded" 
                            style={{ width: `${60 + Math.random() * 30}%` }} 
                        />
                        {/* Message preview */}
                        <SkeletonBase 
                            className="h-3 rounded" 
                            style={{ width: `${40 + Math.random() * 40}%` }} 
                        />
                    </div>
                    
                    {/* Time */}
                    <SkeletonBase className="w-10 h-3 rounded shrink-0" />
                </div>
            ))}
        </div>
    );
}

// Message skeleton (for loading messages)
export function MessageSkeleton({ count = 6, isGroup = false }) {
    return (
        <div className="space-y-4 p-4">
            {Array.from({ length: count }).map((_, i) => {
                const isOwnMessage = i % 3 === 0; // Every 3rd message is "own"
                
                return (
                    <div 
                        key={i} 
                        className={`flex gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                    >
                        {/* Avatar (only for others in group) */}
                        {!isOwnMessage && isGroup && (
                            <SkeletonBase className="w-8 h-8 rounded-full shrink-0" />
                        )}
                        
                        {/* Message bubble */}
                        <div 
                            className={`max-w-[70%] space-y-2 ${isOwnMessage ? 'items-end' : 'items-start'}`}
                        >
                            {/* Sender name (group only) */}
                            {!isOwnMessage && isGroup && (
                                <SkeletonBase className="h-3 w-20 rounded" />
                            )}
                            
                            {/* Message content */}
                            <div 
                                className={`rounded-2xl p-4 space-y-2 ${
                                    isOwnMessage 
                                        ? 'bg-violet-500/20 dark:bg-violet-500/10' 
                                        : 'bg-slate-200/50 dark:bg-slate-700/50'
                                }`}
                            >
                                <SkeletonBase 
                                    className="h-4 rounded" 
                                    style={{ width: `${100 + Math.random() * 100}px` }} 
                                />
                                {Math.random() > 0.5 && (
                                    <SkeletonBase 
                                        className="h-4 rounded" 
                                        style={{ width: `${60 + Math.random() * 80}px` }} 
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Profile panel skeleton
export function ProfileSkeleton() {
    return (
        <div className="p-6 space-y-6 animate-pulse">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
                <SkeletonBase className="w-28 h-28 rounded-full" />
                <SkeletonBase className="h-6 w-32 rounded" />
                <SkeletonBase className="h-4 w-24 rounded" />
            </div>
            
            {/* Bio section */}
            <div className="space-y-3">
                <SkeletonBase className="h-4 w-16 rounded" />
                <SkeletonBase className="h-4 w-full rounded" />
                <SkeletonBase className="h-4 w-3/4 rounded" />
            </div>
            
            {/* Groups section */}
            <div className="space-y-3">
                <SkeletonBase className="h-4 w-32 rounded" />
                {[1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3">
                        <SkeletonBase className="w-10 h-10 rounded-lg" />
                        <div className="flex-1 space-y-2">
                            <SkeletonBase className="h-4 w-24 rounded" />
                            <SkeletonBase className="h-3 w-16 rounded" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Shared media skeleton
// Shared media skeleton
export function SharedMediaSkeleton({ count = 9, type = 'photos' }) {
    if (type === 'photos') {
        return (
            <div className="grid grid-cols-3 gap-1 p-2">
                {Array.from({ length: count }).map((_, i) => (
                    <SkeletonBase 
                        key={i} 
                        className="aspect-square rounded-lg" 
                    />
                ))}
            </div>
        );
    }
    
    if (type === 'videos') {
         return (
            <div className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                        <SkeletonBase className="w-16 h-16 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-2 py-2">
                             <SkeletonBase className="h-4 w-24 rounded" />
                             <SkeletonBase className="h-3 w-16 rounded" />
                        </div>
                    </div>
                ))}
            </div>
         );
    }

    if (type === 'files' || type === 'links') {
        return (
            <div className="space-y-3 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-3 items-center">
                        <SkeletonBase className="w-10 h-10 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-2">
                             <SkeletonBase className="h-3 w-3/4 rounded" />
                             <SkeletonBase className="h-3 w-1/2 rounded" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return null;
}

// Single line skeleton (generic)
export function LineSkeleton({ width = '100%', height = '1rem', className = '' }) {
    return (
        <SkeletonBase 
            className={className} 
            style={{ width, height }} 
        />
    );
}

export default {
    ChatListSkeleton,
    MessageSkeleton,
    ProfileSkeleton,
    SharedMediaSkeleton,
    LineSkeleton
};

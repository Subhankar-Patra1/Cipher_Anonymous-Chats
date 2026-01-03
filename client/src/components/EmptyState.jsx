import React from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

/**
 * Reusable empty state component with illustration and message
 * @param {string} icon - Material symbol icon name
 * @param {string} title - Main title text
 * @param {string} description - Optional description text
 * @param {React.ReactNode} action - Optional action button
 * @param {string} className - Additional CSS classes
 * @param {'default'|'chat'|'media'|'search'} variant - Style variant
 */
export default function EmptyState({ 
    icon = 'inbox',
    title = 'Nothing here yet',
    description,
    action,
    className = '',
    variant = 'default'
}) {
    const variants = {
        default: {
            iconBg: 'from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800',
            iconColor: 'text-slate-400 dark:text-slate-500'
        },
        chat: {
            iconBg: 'from-violet-100 to-indigo-100 dark:from-violet-900/20 dark:to-indigo-900/20',
            iconColor: 'text-violet-400 dark:text-violet-500'
        },
        media: {
            iconBg: 'from-sky-100 to-cyan-100 dark:from-sky-900/20 dark:to-cyan-900/20',
            iconColor: 'text-sky-400 dark:text-sky-500'
        },
        search: {
            iconBg: 'from-amber-100 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20',
            iconColor: 'text-amber-400 dark:text-amber-500'
        }
    };

    const style = variants[variant] || variants.default;

    return (
        <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
            {/* Animated icon container */}
            <div className={`relative mb-6`}>
                {/* Background glow */}
                <div className={`absolute inset-0 bg-gradient-to-br ${style.iconBg} rounded-full blur-xl opacity-50 scale-150`} />
                
                {/* Icon circle */}
                <div className={`relative w-20 h-20 rounded-full bg-gradient-to-br ${style.iconBg} flex items-center justify-center shadow-lg`}>
                    <span className={`material-symbols-outlined text-4xl ${style.iconColor}`}>
                        {icon}
                    </span>
                </div>
                
                {/* Decorative dots */}
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-400/30 dark:bg-violet-500/20 animate-pulse" />
                <div className="absolute -bottom-2 -left-2 w-2 h-2 rounded-full bg-indigo-400/30 dark:bg-indigo-500/20 animate-pulse animation-delay-500" />
            </div>
            
            {/* Title */}
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
                {title}
            </h3>
            
            {/* Description */}
            {description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[250px] leading-relaxed">
                    {description}
                </p>
            )}
            
            {/* Action button */}
            {action && (
                <div className="mt-6">
                    {action}
                </div>
            )}
        </div>
    );
}

// Pre-configured empty states for common use cases
export function NoChatSelected() {
    return (
        <EmptyState
            icon="chat_bubble_outline"
            title="Select a conversation"
            description="Choose a chat from the sidebar to start messaging"
            variant="chat"
        />
    );
}

export function NoMessages() {
    return (
        <div className="flex flex-col items-center justify-center py-6 sm:py-12 px-4 sm:px-6 text-center h-full overflow-hidden">
            {/* Lottie Animation Container - smaller on mobile */}
            <div className="relative mb-2 sm:mb-4 w-32 h-32 sm:w-48 sm:h-48">
                {/* DotLottie Animation - supports .lottie files */}
                <DotLottieReact
                    src="/animations/Share.lottie"
                    loop
                    autoplay
                    className="w-full h-full"
                />
            </div>
            
            {/* Title - responsive text size */}
            <h3 className="text-base sm:text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1 sm:mb-2">
                No messages here
            </h3>
            
            {/* Description - responsive text and width */}
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-[220px] sm:max-w-[280px] leading-relaxed">
                Start the conversation by sending a message
            </p>
            
            {/* Decorative elements */}
            <div className="flex items-center gap-2 mt-3 sm:mt-4 opacity-50">
                <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-violet-400 animate-pulse" />
                <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-indigo-400 animate-pulse animation-delay-200" />
                <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-cyan-400 animate-pulse animation-delay-400" />
            </div>
        </div>
    );
}

export function NoChats({ onCreateRoom }) {
    return (
        <EmptyState
            icon="groups"
            title="No chats yet"
            description="Create a new room or join an existing one to get started"
            variant="chat"
            action={
                onCreateRoom && (
                    <button
                        onClick={onCreateRoom}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-lg">add</span>
                        New Room
                    </button>
                )
            }
        />
    );
}

export function NoMedia() {
    return (
        <EmptyState
            icon="perm_media"
            title="No media shared"
            description="Photos, videos, and files shared in this chat will appear here"
            variant="media"
        />
    );
}

export function NoSearchResults({ query }) {
    return (
        <EmptyState
            icon="search_off"
            title="No results found"
            description={query ? `No matches for "${query}"` : "Try a different search term"}
            variant="search"
        />
    );
}

export function NoArchivedChats() {
    return (
        <EmptyState
            icon="inventory_2"
            title="No archived chats"
            description="Archived conversations will appear here"
            variant="default"
        />
    );
}

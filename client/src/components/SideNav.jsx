import { useTheme } from '../context/ThemeContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import SparkleLogo from './icons/SparkleLogo';

/**
 * SideNav - Slim left icon navigation for desktop
 * Filters: Group, Direct, AI
 */
export default function SideNav({ activeFilter, onFilterChange, unreadCounts = {}, onLogout }) {
    const { theme, toggleTheme } = useTheme();
    
    const filters = [
        { 
            id: 'direct', 
            icon: 'chat', 
            label: 'Direct Messages',
            unread: unreadCounts.direct || 0
        },
        { 
            id: 'group', 
            icon: 'groups', 
            label: 'Groups',
            unread: unreadCounts.group || 0
        },
        { 
            id: 'ai', 
            icon: 'auto_awesome', 
            label: 'AI Assistant',
            unread: 0,
            isAI: true
        }
    ];

    return (
        <div className="hidden md:flex flex-col w-16 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 py-4 items-center gap-2 shrink-0 transition-colors">
            {/* Filter Buttons */}
            <div className="flex flex-col gap-2 items-center">
                {filters.map(filter => (
                    <button
                        key={filter.id}
                        onClick={() => onFilterChange(filter.id)}
                        className={`
                            relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200
                            ${activeFilter === filter.id 
                                ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400' 
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                            }
                        `}
                        title={filter.label}
                    >
                        {filter.isAI ? (
                            <SparkleLogo className={`w-6 h-6 ${activeFilter === 'ai' ? '' : 'opacity-80'}`} />
                        ) : (
                            <span className={`material-symbols-outlined text-xl ${activeFilter === filter.id ? 'material-symbols-filled' : ''}`}>{filter.icon}</span>
                        )}
                        
                        {/* Unread Badge */}
                        {filter.unread > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-slate-100 dark:border-slate-950">
                                {filter.unread > 99 ? '99+' : filter.unread}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Bottom Buttons - Theme & Logout */}
            <div className="flex flex-col gap-2 items-center">
                {/* Theme Toggle */}
                <button 
                    onClick={(e) => toggleTheme(e)} 
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-amber-500 dark:hover:text-yellow-400 transition-all duration-200"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    <span className="material-symbols-outlined text-xl transition-transform duration-500 rotate-0 dark:rotate-180">
                        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>

                {/* Logout */}
                <button 
                    onClick={onLogout} 
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-all duration-200"
                    title="Logout"
                >
                    <span className="material-symbols-outlined text-xl">logout</span>
                </button>
            </div>
        </div>
    );
}

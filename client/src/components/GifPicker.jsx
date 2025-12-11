import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export default function GifPicker({ onSendGif }) {
    const [search, setSearch] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null); // [NEW] Error state
    const [nextPos, setNextPos] = useState(0);
    const [activeTab, setActiveTab] = useState('trending'); 
    const { token } = useAuth();
    const gridRef = useRef(null);
    const abortControllerRef = useRef(null);
    
    // Quick filters
    const filters = ['Trending', 'Reaction', 'Meme', 'Sad', 'Love'];

    const fetchGifs = async (endpoint, params = {}, replace = false) => {
        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const queryParams = new URLSearchParams(params);
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gifs/${endpoint}?${queryParams.toString()}`, {
                headers: { authorization: `Bearer ${token}` },
                signal: controller.signal
            });
            
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to fetch GIFs');
            }

            const data = await res.json();
            
            if (replace) {
                setGifs(data.results);
            } else {
                setGifs(prev => [...prev, ...data.results]);
            }
            setNextPos(data.next);
        } catch (err) { // Handle abort vs error
            if (err.name === 'AbortError') return;
            console.error(err);
            setError(err.message);
            if (replace) setGifs([]); // Clear on error if replacing
        } finally {
            if (controller.signal.aborted) return;
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    // Initial load & Search effect combined
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (!search.trim()) {
                fetchGifs('trending', { limit: 20 }, true);
                setActiveTab('trending');
            } else {
                fetchGifs('search', { q: search, limit: 20 }, true);
                setActiveTab('search');
            }
        }, 300); // 300ms debounce for typing

        return () => {
            clearTimeout(timeout);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [search]); // Only depend on search changes

    // Lazy load videos (Observed elements)
    useEffect(() => {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    const video = e.target.querySelector('video[data-src]');
                    if (video && !video.src) {
                        video.src = video.dataset.src;
                        video.removeAttribute('data-src');
                    }
                }
            });
        }, { root: gridRef.current, threshold: 0.1 });

        const tileElements = document.querySelectorAll('.gif-tile');
        tileElements.forEach(el => obs.observe(el));
        return () => obs.disconnect();
    }, [gifs]);

    const handleScroll = (e) => {
        const bottom = e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 100;
        if (bottom && nextPos && !loading && !error) {
            // Keep using the current abort controller for scroll? No, separate call.
            // But fetchGifs cancels previous. Scroll shouldn't cancel? 
            // Actually fetchGifs implementation cancels everything. 
            // We should modify fetchGifs to NOT cancel if it's pagination?
            // For simplicity, let's just allow pagination to proceed without cancelling unless search changes.
            // But we can't easily change fetchGifs signature reuse.
            // Let's rely on loading check for pagination.
            // But fetchGifs clears controller.
            
            // FIXME: The fetchGifs creates new controller. If we call it for scroll, it's fine.
            // But we need to ensure we don't spam.
            
            const endpoint = activeTab === 'search' ? 'search' : 'trending';
            const params = activeTab === 'search' 
                ? { q: search, limit: 20, pos: nextPos } 
                : { limit: 20, pos: nextPos };
            
           // We need a version of fetch that doesn't abort? or just use fetchGifs 
           // If we scroll, we want to append.
           loadMore(endpoint, params);
        }
    };

    // Separate function for loading more to avoid cancelling current (if we wanted to diverge)
    // But actually, if we are scrolling, we ARE the current action.
    // The only issue is if 'search' effect runs? No, search won't change during scroll.
    const loadMore = async (endpoint, params) => {
        if (loading) return; 
        setLoading(true);
        try {
             // We don't abort previous here because we are appending? 
             // Actually if we abort, we kill the previous scroll request? That's fine.
            const queryParams = new URLSearchParams(params);
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gifs/${endpoint}?${queryParams.toString()}`, {
                headers: { authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setGifs(prev => [...prev, ...data.results]);
            setNextPos(data.next);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterClick = (filter) => {
        setSearch(filter);
    };

    return (
        <div className="flex flex-col h-[400px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 transition-colors">
            {/* Search Bar */}
            <div className="p-3 border-b border-slate-200/50 dark:border-slate-700/50 transition-colors">
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 material-symbols-outlined text-[20px]">
                        search
                    </span>
                    <input
                        type="text"
                        placeholder="Search GIFs via Tenor"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-violet-500 focus:outline-none placeholder:text-slate-500 text-sm transition-colors"
                        autoFocus
                    />
                    {search && (
                        <button 
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Quick Filters */}
            {!search && (
                <div className="flex gap-2 overflow-x-auto px-3 pb-2 pt-1 no-scrollbar">
                    {filters.map(f => (
                        <button
                            type="button"
                            key={f}
                            onClick={() => handleFilterClick(f)}
                            className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:border-violet-500/50 transition-all whitespace-nowrap"
                        >
                            {f}
                        </button>
                    ))}
                </div>
            )}

            {/* Grid */}
            <div 
                ref={gridRef}
                className="flex-1 overflow-y-auto p-3 min-h-0 custom-scrollbar"
                onScroll={handleScroll}
            >
                <div className="grid grid-cols-4 gap-3">
                    {gifs.map(gif => (
                        <button
                            type="button"
                            key={gif.id}
                            onClick={() => onSendGif(gif)}
                            className="gif-tile relative aspect-square rounded-md overflow-hidden group bg-slate-100 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 hover:shadow-lg transition-all"
                        >
                            {gif.autoplay_url ? (
                                <video
                                    data-src={gif.autoplay_url}
                                    className="w-full h-full object-cover block"
                                    loop
                                    muted
                                    playsInline
                                    autoPlay
                                    disablePictureInPicture
                                />
                            ) : (
                                <img 
                                    src={gif.preview_url} 
                                    alt={gif.title}
                                    className="w-full h-full object-cover block"
                                    loading="lazy"
                                />
                            )}
                            
                            {/* Overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10" />
                        </button>
                    ))}
                    
                    {/* Skeletons while loading */}
                    {loading && Array.from({ length: 12 }).map((_, i) => (
                         <div key={`sk-${i}`} className="aspect-square rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse transition-colors" />
                    ))}
                </div>
                
                {error && (
                    <div className="flex flex-col items-center justify-center h-full text-red-500 dark:text-red-400 text-sm py-10 px-4 text-center">
                        <span className="material-symbols-outlined text-3xl mb-2">error</span>
                        <p>{error}</p>
                        <button 
                            type="button"
                            onClick={() => setSearch(s => s ? s : ' ')} // trigger effect
                            className="mt-3 text-xs bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-300 px-3 py-1 rounded-md border border-red-200 dark:border-red-500/20 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                )}
                
                {!loading && !error && gifs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm py-10">
                        <span className="material-symbols-outlined text-4xl mb-2 opacity-50">gif_box</span>
                        <span>No GIFs found</span>
                    </div>
                )}
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-900 px-2 py-1 flex justify-center border-t border-slate-200 dark:border-slate-800 transition-colors">
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    Powered by <img src="https://tenor.com/assets/img/tenor-logo.svg" className="h-3 opacity-50 filter grayscale dark:invert" alt="Tenor" />
                </span>
            </div>
        </div>
    );
}

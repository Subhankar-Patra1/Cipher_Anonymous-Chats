import React, { useEffect, useState } from 'react';

export default function LoadingScreen() {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Simulate progress bar with a slightly smoother curve
        const interval = setInterval(() => {
            setProgress(prev => {
                // Slow down as it gets closer to 100
                const remaining = 100 - prev;
                const increment = Math.random() * (remaining / 5) + 1;
                const next = prev + increment;
                return next > 99 ? 99 : next; // Stay at 99 until unmount effectively
            });
        }, 100);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 h-[100dvh] bg-[#0f172a] text-white flex flex-col items-center justify-center z-[9999] transition-opacity duration-500 font-sans">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[100px] animate-pulse-slow" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm px-6 mx-auto translate-x-3 sm:translate-x-0">
                {/* Logo with Glow */}
                <div className="relative group">
                    <div className="absolute inset-0 bg-violet-500 blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-500 rounded-full" />
                    <img 
                        src="/logo.svg" 
                        alt="Cipher" 
                        className="w-24 h-24 object-contain relative z-10 drop-shadow-2xl animate-breathe" 
                    />
                </div>

                {/* Progress Container */}
                <div className="w-full flex flex-col items-center gap-3">
                    <div className="w-full h-1.5 bg-slate-800/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
                        <div 
                            className="h-full bg-gradient-to-r from-violet-600 via-indigo-500 to-violet-600 bg-[length:200%_100%] animate-shimmer shadow-[0_0_15px_rgba(139,92,246,0.5)] rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm font-medium tracking-wide">
                        <span className="w-2 h-2 rounded-full bg-violet-500 animate-ping" />
                        <span className="animate-pulse">Loading secure chats...</span>
                    </div>
                </div>
            </div>



            <style>{`
                @keyframes shimmer {
                    0% { background-position: 100% 0; }
                    100% { background-position: -100% 0; }
                }
                .animate-shimmer {
                    animation: shimmer 2s linear infinite;
                }
                .animate-breathe {
                    animation: breathe 3s ease-in-out infinite;
                }
                @keyframes breathe {
                    0%, 100% { transform: scale(1); filter: drop-shadow(0 25px 25px rgba(0,0,0,0.15)); }
                    50% { transform: scale(1.05); filter: drop-shadow(0 25px 35px rgba(139,92,246,0.2)); }
                }
            `}</style>
        </div>
    );
}

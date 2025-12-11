import { useState, useRef, useEffect } from 'react';

const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function AudioPlayer({ src, durationMs, waveform, isMe, isHeard, onMarkHeard }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const audioRef = useRef(null);
    const waveformRef = useRef(null);
    const [currentTime, setCurrentTime] = useState(0);

    // Ensure waveform is an array. If string (legacy or error), try to parse or default.
    const bars = Array.isArray(waveform) ? waveform : [];

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            // Stop other audios? (Optional: use efficient event bus or context if needed)
            // For now, simple independent player
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const togglePlaybackRate = () => {
        const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
        setPlaybackRate(nextRate);
        if (audioRef.current) {
            audioRef.current.playbackRate = nextRate;
        }
    };

    const handleWaveformClick = (e) => {
        if (!audioRef.current || !audioRef.current.duration) return;
        
        const rect = waveformRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, x / rect.width));
        
        audioRef.current.currentTime = ratio * audioRef.current.duration;
        setProgress(ratio);
        setCurrentTime(audioRef.current.currentTime * 1000);
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime * 1000);
            const ratio = audio.currentTime / audio.duration;
            setProgress(ratio);

            // Mark as heard if played > 80%
            if (!isMe && !isHeard && ratio > 0.8 && onMarkHeard) {
                onMarkHeard();
            }
        };

        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
            // Also mark as heard on end just in case
            if (!isMe && !isHeard && onMarkHeard) {
                onMarkHeard();
            }
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('ended', onEnded);
        };
    }, [isMe, isHeard, onMarkHeard]);

    useEffect(() => {
        if (audioRef.current && isPlaying) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate, isPlaying]);

    // Style variants based on isMe
    const baseButton = isMe 
        ? "bg-white/20 hover:bg-white/30 text-white" 
        : "bg-slate-900/10 hover:bg-slate-900/20 dark:bg-white/10 dark:hover:bg-white/20 text-violet-600 dark:text-white";
    
    const textColor = isMe
        ? "text-white/70"
        : "text-slate-500 dark:text-slate-400";

    const badgeColor = isMe
        ? "bg-white/10 hover:bg-white/20 text-white border-white/5"
        : "bg-slate-900/10 hover:bg-slate-900/20 dark:bg-white/10 dark:hover:bg-white/20 text-violet-600 dark:text-white border-violet-200 dark:border-white/5";

    // If waveform is missing, render a dummy line
    const renderWaveform = () => {
        if (!bars.length) {
            return (
                <div 
                    ref={waveformRef}
                    onClick={handleWaveformClick}
                    className="flex-1 h-3 rounded-full overflow-hidden cursor-pointer flex items-center relative group"
                >
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'bg-white/10' : 'bg-slate-900/10 dark:bg-white/10'}`} />
                    <div className={`w-full h-full opacity-20 ${isMe ? 'bg-white' : 'bg-slate-900 dark:bg-white'}`} />
                    <div 
                        className={`h-full transition-all duration-100 ease-linear rounded-full absolute left-0 ${isMe ? 'bg-white/80' : 'bg-violet-500 dark:bg-white/80'}`}
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
            );
        }

        return (
            <div 
                ref={waveformRef} 
                onClick={handleWaveformClick}
                className="flex-1 flex items-center h-8 gap-[1px] opacity-80 cursor-pointer relative group select-none"
            >
                <div className={`absolute inset-0 top-1 bottom-1 -left-1 -right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'bg-white/5' : 'bg-slate-900/5 dark:bg-white/5'}`} />
                
                {bars.map((v, i) => {
                    // Determine if this bar is "past" the playback head
                    const barPos = i / bars.length;
                    const isPlayed = barPos <= progress;
                    
                    const barColor = isPlayed 
                        ? (isMe ? 'bg-white' : 'bg-violet-600 dark:bg-white')
                        : (isMe ? 'bg-white/30' : 'bg-slate-900/20 dark:bg-white/30');

                    return (
                        <div
                            key={i}
                            className={`flex-1 rounded-full transition-colors duration-100 ${barColor}`}
                            style={{ 
                                height: `${20 + v * 80}%`, 
                                minHeight: '4px',
                            }}
                        />
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex items-center gap-2 min-w-[200px] select-none">
            <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
            
            <div className="relative">
                <button
                    onClick={togglePlay}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition shrink-0 ${baseButton}`}
                >
                    <span className="material-symbols-outlined text-[24px]">
                        {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                </button>
                {/* Unread Indicator */}
                {!isMe && !isHeard && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </span>
                )}
            </div>

            <div className="flex-1 flex flex-col justify-center min-w-[80px]">
               {renderWaveform()}
            </div>

            <div className="flex flex-col items-end gap-1">
                 <button
                    type="button"
                    onClick={togglePlaybackRate}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors border ${badgeColor}`}
                >
                    {playbackRate}x
                </button>
                <span className={`text-[10px] font-medium tabular-nums ${textColor}`}>
                    {isPlaying ? formatDuration(currentTime) : formatDuration(durationMs)}
                </span>
            </div>
        </div>
    );
}

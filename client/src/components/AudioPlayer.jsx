import { useState, useRef, useEffect } from 'react';

const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function AudioPlayer({ src, durationMs, waveform }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef(null);
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

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime * 1000);
            setProgress(audio.currentTime / audio.duration);
        };

        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('ended', onEnded);
        };
    }, []);

    // If waveform is missing, render a dummy line
    const renderWaveform = () => {
        if (!bars.length) {
            return (
                <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-white/80 transition-all duration-100 ease-linear"
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
            );
        }

        return (
            <div className="flex-1 flex items-center h-8 gap-[1px] opacity-80">
                {bars.map((v, i) => {
                    // Determine if this bar is "past" the playback head
                    const barPos = i / bars.length;
                    const isPlayed = barPos <= progress;

                    return (
                        <div
                            key={i}
                            className={`flex-1 rounded-full transition-colors duration-100 ${isPlayed ? 'bg-white' : 'bg-white/30'}`}
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
        <div className="flex items-center gap-3 min-w-[200px]">
            <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
            
            <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-slate-100/10 flex items-center justify-center hover:bg-slate-100/20 transition text-white shrink-0"
            >
                <span className="material-symbols-outlined text-[20px]">
                    {isPlaying ? 'pause' : 'play_arrow'}
                </span>
            </button>

            <div className="flex-1 flex flex-col justify-center">
               {renderWaveform()}
            </div>

            <span className="text-xs font-medium text-white/70 tabular-nums w-10 text-right">
                {isPlaying ? formatDuration(currentTime) : formatDuration(durationMs)}
            </span>
        </div>
    );
}

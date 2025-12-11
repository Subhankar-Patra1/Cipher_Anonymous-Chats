import React from 'react';

const StatusDot = ({ online }) => {
    return (
        <span
            className={`absolute bottom-[-2px] right-[-2px] w-[10px] h-[10px] rounded-full border-2 border-white dark:border-slate-900 transition-colors duration-300 ${
                online
                    ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)] animate-pulse'
                    : 'bg-slate-400 opacity-90'
            }`}
             style={online ? { animation: 'pulse 1.6s infinite' } : {}}
        />
    );
};

export default StatusDot;

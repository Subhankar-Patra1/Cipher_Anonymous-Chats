import React from 'react';

const SelectionBar = ({ count, onCancel, onDelete, onCopy, canCopy }) => {
    return (
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 h-[72px] animate-in slide-in-from-bottom duration-200 z-20">
            <div className="flex items-center gap-4">
                <button 
                    onClick={onCancel}
                    className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
                    title="Cancel selection"
                >
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
                <span className="text-lg font-semibold text-slate-800 dark:text-white">
                    {count} selected
                </span>
            </div>



            <div className="flex items-center gap-2">
                <button 
                    onClick={onCopy}
                    disabled={!canCopy}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        canCopy 
                            ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300' 
                            : 'opacity-40 cursor-not-allowed text-slate-400'
                    }`}
                    title="Copy selected"
                >
                    <span className="material-symbols-outlined text-xl">content_copy</span>
                </button>

                <button 
                    onClick={onDelete}
                    className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                    title="Delete selected"
                    disabled={count === 0}
                >
                    <span className="material-symbols-outlined text-xl">delete</span>
                </button>
            </div>
        </div>
    );
};

export default SelectionBar;

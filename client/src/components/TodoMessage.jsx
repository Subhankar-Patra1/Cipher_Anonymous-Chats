import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

export default function TodoMessage({ msg, onUpdate }) {
    const { user, token } = useAuth();
    const todo = msg.todo;
    const [isUpdating, setIsUpdating] = useState(null); // specific item ID being updated

    if (!todo) return <div className="p-3 text-red-500">Invalid Task List</div>;

    const handleToggle = async (itemId, currentStatus) => {
        if (isUpdating) return;
        setIsUpdating(itemId);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/todos/${todo.id}/items/${itemId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ is_completed: !currentStatus })
            });

            if (res.ok) {
                // Socket will handle the update, but we can optimistically update if needed
                // For now, reliance on socket is safer for consistency
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsUpdating(null);
        }
    };

    const isMe = String(msg.user_id) === String(user.id);
    const completedCount = todo.items.filter(i => i.is_completed).length;
    const progress = Math.round((completedCount / todo.items.length) * 100) || 0;

    return (
        <div className="min-w-[280px] sm:min-w-[320px] max-w-full">
            <div className="mb-3">
                <div className="flex justify-between items-start gap-2">
                    <h3 className={`font-bold text-[15px] leading-tight flex items-center gap-2 ${isMe ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                        <span className="material-symbols-outlined text-[20px] opacity-75">checklist</span>
                        {renderTextWithEmojis(todo.title || 'To-Do List')}
                    </h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
                        isMe 
                        ? 'bg-white/20 text-white' 
                        : 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300'
                    }`}>
                        TASKS
                    </span>
                </div>
                <p className={`text-xs mt-1 ${isMe ? 'text-violet-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    Created by {renderTextWithEmojis(todo.created_by_name)}
                </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
                <div className={`flex justify-between text-xs font-semibold mb-1 ${isMe ? 'text-violet-100' : 'text-slate-600 dark:text-slate-300'}`}>
                    <span>{progress}% Completed</span>
                    <span>{completedCount}/{todo.items.length}</span>
                </div>
                <div className={`h-1.5 w-full rounded-full overflow-hidden ${isMe ? 'bg-black/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                    <div 
                        className={`h-full transition-all duration-500 ease-out ${isMe ? 'bg-white' : 'bg-violet-500'}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            <div className="space-y-2">
                {todo.items.map((item) => (
                    <div 
                        key={item.id}
                        onClick={() => handleToggle(item.id, item.is_completed)}
                        className={`
                            flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer
                            ${item.is_completed 
                                ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50 opacity-75' 
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm'
                            }
                        `}
                    >
                        <div className={`
                            w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                            ${item.is_completed
                                ? 'bg-green-500 border-green-500'
                                : 'border-slate-300 dark:border-slate-500'
                            }
                        `}>
                            {isUpdating === item.id ? (
                                <span className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin"/>
                            ) : item.is_completed && (
                                <span className="material-symbols-outlined text-[14px] text-white font-bold">check</span>
                            )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="relative inline-flex max-w-full">
                                <p className={`text-sm ${item.is_completed ? 'text-slate-500 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {renderTextWithEmojis(item.text)}
                                </p>
                                {item.is_completed && (
                                    <div className="absolute left-0 right-0 top-[52%] -translate-y-1/2 h-[1.5px] bg-slate-400 dark:bg-slate-500 pointer-events-none" />
                                )}
                            </div>
                            {item.is_completed && item.completed_by_name && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    Done by {renderTextWithEmojis(item.completed_by_name)}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

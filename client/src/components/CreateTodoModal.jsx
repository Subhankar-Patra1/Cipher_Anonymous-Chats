import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function CreateTodoModal({ isOpen, onClose, rooms, activeRoom, fixedRoomId }) {
    const { token } = useAuth();
    const [title, setTitle] = useState('');
    const [items, setItems] = useState(['', '']); // Start with 2 empty items
    const [selectedRoomId, setSelectedRoomId] = useState(fixedRoomId || activeRoom?.id || rooms[0]?.id);
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleItemChange = (index, value) => {
        const newItems = [...items];
        newItems[index] = value;
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, '']);
    };

    const removeItem = (index) => {
        if (items.length <= 1) return;
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validItems = items.filter(i => i.trim() !== '');
        
        if (!title.trim() || validItems.length === 0) return;

        setIsLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/todos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    room_id: selectedRoomId,
                    title: title,
                    items: validItems
                })
            });

            if (res.ok) {
                onClose();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-violet-500">checklist</span>
                        New Task List
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 max-h-[70vh] overflow-y-auto">
                    {/* Room Selector */}
                    {!fixedRoomId && (
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Share in</label>
                            <select 
                                value={selectedRoomId}
                                onChange={(e) => setSelectedRoomId(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg p-2.5 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500"
                            >
                                {rooms.map(room => (
                                    <option key={room.id} value={room.id}>
                                        {room.name || 'Unnamed Chat'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., Grocery List, Project Tasks"
                            className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg p-2.5 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500 font-semibold"
                            autoFocus
                        />
                    </div>

                    <div className="mb-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Items</label>
                        <div className="space-y-2">
                            {items.map((item, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={item}
                                        onChange={(e) => handleItemChange(idx, e.target.value)}
                                        placeholder={`Item ${idx + 1}`}
                                        className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-lg p-2 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500"
                                    />
                                    {items.length > 1 && (
                                        <button 
                                            type="button"
                                            onClick={() => removeItem(idx)}
                                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">remove_circle_outline</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={addItem}
                            className="mt-3 text-sm text-violet-600 dark:text-violet-400 font-medium hover:text-violet-700 flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            Add Item
                        </button>
                    </div>
                </form>

                <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-950/50">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={isLoading || !title.trim()}
                        className="px-6 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 active:bg-violet-800 rounded-lg shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                        {isLoading ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : 'Create List'}
                    </button>
                </div>
            </div>
        </div>
    );
}

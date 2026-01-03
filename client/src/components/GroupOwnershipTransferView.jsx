import React, { useState } from 'react';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

export default function GroupOwnershipTransferView({
    room,
    members,
    currentUser,
    onTransfer,
    onBack,
    isTransferring
}) {
    // Filter out current user from potential owners
    const potentialOwners = members.filter(m => String(m.id) !== String(currentUser.id));
    
    // Search state
    const [searchQuery, setSearchQuery] = useState('');

    // Filter based on search
    const filteredMembers = potentialOwners.filter(m => 
        m.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelect = (member) => {
        if (confirm(`Are you sure you want to transfer ownership to ${member.display_name} and leave the group? This cannot be undone.`)) {
            onTransfer(member.id);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/80 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-colors duration-300">
             <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-[80vh] animate-modal-scale overflow-hidden transition-colors">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 transition-colors bg-white dark:bg-slate-900 z-10">
                    <button 
                        onClick={onBack}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                        <h3 className="text-slate-800 dark:text-white font-bold text-lg transition-colors">Transfer Ownership</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-500 transition-colors">Select a new owner before leaving</p>
                    </div>
                </div>

                {/* Warning Banner */}
                <div className="bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3 border-b border-amber-100 dark:border-amber-900/30">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-500 shrink-0">warning</span>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                        You must transfer ownership to another member before you can leave this group. Once transferred, you will be removed from the group.
                    </p>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                        <input 
                            type="text"
                            placeholder="Search members..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500/50 outline-none transition-all placeholder:text-slate-400"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Members List */}
                <div className="overflow-y-auto custom-scrollbar flex-1 p-2 space-y-1">
                    {filteredMembers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-400 dark:text-slate-500">
                             <span className="material-symbols-outlined text-4xl mb-2 opacity-50">person_off</span>
                             <p>No members found</p>
                        </div>
                    ) : (
                        filteredMembers.map(member => (
                            <button
                                key={member.id}
                                onClick={() => handleSelect(member)}
                                disabled={isTransferring}
                                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group text-left disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                     {/* Avatar */}
                                    {member.avatar_thumb_url ? (
                                        <img 
                                            src={member.avatar_thumb_url} 
                                            alt={member.display_name} 
                                            className="w-10 h-10 rounded-full object-cover bg-slate-200 dark:bg-slate-800 shrink-0"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors">
                                            {member.display_name[0].toUpperCase()}
                                        </div>
                                    )}
                                    
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2 truncate transition-colors">
                                            <span>{renderTextWithEmojis(member.display_name)}</span>
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                             <span className="text-[10px] text-slate-500 dark:text-slate-500 font-mono truncate transition-colors">
                                                {member.username.startsWith('@') ? member.username : `@${member.username}`}
                                            </span>
                                            {member.role === 'admin' && (
                                                <span className="text-[9px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 px-1.5 rounded font-bold uppercase tracking-wider shrink-0">
                                                    Admin
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 group-hover:text-violet-500 transition-colors">
                                    chevron_right
                                </span>
                            </button>
                        ))
                    )}
                </div>
             </div>
        </div>
    );
}

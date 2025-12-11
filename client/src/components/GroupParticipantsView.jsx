import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import GroupAddParticipantsView from './GroupAddParticipantsView';

const GroupParticipantsViewContent = ({
    room,
    members,
    currentUser,
    canAddMember,
    isOwner,
    isAdmin,
    onAddMember,
    onKick,
    onPromote,
    onDemote,
    onBack
}) => {
    const [view, setView] = useState('list'); // 'list' | 'add'

    if (view === 'add') {
        return (
            <GroupAddParticipantsView 
                room={room}
                onAddMember={onAddMember}
                onBack={() => setView('list')}
            />
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900">
             {/* Header */}
             <div className="p-4 border-b border-slate-800 flex items-center gap-3">
                <button 
                    onClick={onBack}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                    <h3 className="text-white font-bold text-lg">Group Participants</h3>
                    <p className="text-xs text-slate-500">{members.length} participants</p>
                </div>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1">
                 {/* Add Member Button - Now a navigation row */}
                {canAddMember && (
                    <div className="p-0">
                        <button 
                            onClick={() => setView('add')}
                            className="w-full flex items-center gap-4 p-4 hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 group"
                        >
                            <div className="w-10 h-10 rounded-full bg-violet-600/20 text-violet-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-xl">person_add</span>
                            </div>
                            <div className="flex-1 text-left">
                                <span className="text-slate-200 font-medium block">Add participants</span>
                            </div>
                        </button>
                    </div>
                )}

                {/* List */}
                <div className="p-4 space-y-1">
                    {members.map(member => (
                        <div key={member.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors group relative">
                            <div className="flex items-center gap-3 overflow-hidden">
                                {member.avatar_thumb_url ? (
                                    <img 
                                        src={member.avatar_thumb_url} 
                                        alt={member.display_name} 
                                        className="w-10 h-10 rounded-full object-cover bg-slate-800 shrink-0"
                                    />
                                ) : (
                                    <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold ${
                                        String(member.id) === String(currentUser?.id)
                                        ? 'bg-violet-600 text-white' 
                                        : 'bg-slate-700 text-slate-300'
                                    }`}>
                                        {member.display_name[0].toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-200 flex items-center gap-2 truncate">
                                        {member.display_name}
                                        {String(member.id) === String(currentUser?.id) && <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 uppercase font-bold tracking-wider shrink-0">You</span>}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                         <span className="text-[10px] text-slate-500 font-mono truncate">
                                            {member.username.startsWith('@') ? member.username : `@${member.username}`}
                                        </span>
                                        {member.role === 'owner' && <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 rounded font-bold uppercase tracking-wider shrink-0">Owner</span>}
                                        {member.role === 'admin' && <span className="text-[9px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1.5 rounded font-bold uppercase tracking-wider shrink-0">Admin</span>}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Actions */}
                            {String(member.id) !== String(currentUser?.id) && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* Promote/Demote */}
                                    {isOwner && member.role === 'member' && (
                                        <button 
                                            onClick={() => onPromote(member.id)}
                                            className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-violet-400/10 rounded-lg transition-colors"
                                            title="Promote to Admin"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">add_moderator</span>
                                        </button>
                                    )}
                                    {isOwner && member.role === 'admin' && (
                                        <button 
                                            onClick={() => onDemote(member.id)}
                                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
                                            title="Demote to Member"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">remove_moderator</span>
                                        </button>
                                    )}

                                    {/* Kick */}
                                    {(isOwner || (isAdmin && member.role === 'member')) && (
                                        <button 
                                            onClick={() => onKick(member.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                            title="Remove from group"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">person_remove</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const GroupParticipantsView = ({
    room,
    members,
    currentUser,
    permissions,
    isOwner,
    isAdmin,
    onAddMember,
    onKick,
    onPromote,
    onDemote,
    onBack
}) => {
    // Determine if the current user can add members
    const canAddMember = isOwner || isAdmin || permissions.allow_add_members;

    return (
        <GroupParticipantsViewContent 
            room={room}
            members={members}
            currentUser={currentUser}
            canAddMember={canAddMember}
            isOwner={isOwner}
            isAdmin={isAdmin}
            onAddMember={onAddMember}
            onKick={onKick}
            onPromote={onPromote}
            onDemote={onDemote}
            onBack={onBack}
        />
    );
};

export default GroupParticipantsView;

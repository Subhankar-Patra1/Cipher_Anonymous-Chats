import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';

export default function GroupInfoModal({ room, onClose, onLeave, onKick }) {
    const { token, user: currentUser } = useAuth();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copySuccess, setCopySuccess] = useState(''); // 'code' or 'link'

    useEffect(() => {
        fetchMembers();
    }, [room.id]);

    const fetchMembers = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setMembers(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text, type) => {
        navigator.clipboard.writeText(text);
        setCopySuccess(type);
        setTimeout(() => setCopySuccess(''), 2000);
    };

    const handleKick = async (userId) => {
        if (!confirm('Remove this member?')) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/members/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setMembers(prev => prev.filter(m => m.id !== userId));
            }
        } catch (error) {
            console.error(error);
        }
    };

    const isOwner = members.find(m => m.id === currentUser.id)?.role === 'owner';
    const inviteLink = `${window.location.origin}/invite?code=${room.code}`;

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{room.name}</h3>
                        <p className="text-xs text-slate-400 font-mono">#{room.code}</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-white transition-colors rounded-full">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto custom-scrollbar flex-1">
                    
                    {/* Share Section (Only for Groups) */}
                    {room.type === 'group' && (
                        <div className="p-6 border-b border-slate-800/50 bg-slate-900/30">
                            <div className="flex flex-col sm:flex-row gap-6 items-center">
                                {/* QR Code */}
                                <div className="bg-white p-3 rounded-lg shadow-lg shrink-0">
                                    <QRCodeSVG value={inviteLink} size={120} level="M" />
                                </div>

                                {/* Share Details */}
                                <div className="flex-1 w-full space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Group Code</label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-800/80 h-10 flex items-center justify-center rounded-lg font-mono text-lg tracking-widest text-white border border-slate-700/50">
                                                {room.code}
                                            </div>
                                            <button 
                                                onClick={() => copyToClipboard(room.code, 'code')}
                                                className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-all ${
                                                    copySuccess === 'code'
                                                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                                                }`}
                                                title="Copy Code"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">{copySuccess === 'code' ? 'check' : 'content_copy'}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Universal Invite Link</label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-800/50 h-10 flex items-center px-3 rounded-lg text-xs text-slate-400 border border-slate-700/50 truncate font-mono select-all">
                                                {inviteLink}
                                            </div>
                                            <button 
                                                onClick={() => copyToClipboard(inviteLink, 'link')}
                                                className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-all ${
                                                    copySuccess === 'link'
                                                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                                                }`}
                                                title="Copy Link"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">{copySuccess === 'link' ? 'check' : 'link'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Members List */}
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Members ({members.length})</p>
                            {loading && <span className="material-symbols-outlined text-slate-600 animate-spin text-sm">progress_activity</span>}
                        </div>
                        
                        <div className="space-y-2">
                            {members.map(member => (
                                <div key={member.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                            member.id === currentUser.id 
                                            ? 'bg-violet-600 text-white' 
                                            : 'bg-slate-700 text-slate-300'
                                        }`}>
                                            {member.display_name[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
                                                {member.display_name}
                                                {member.id === currentUser.id && <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">You</span>}
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-medium">
                                                @{member.username} • <span className={member.role === 'owner' ? 'text-amber-500' : ''}>{member.role}</span>
                                            </p>
                                        </div>
                                    </div>

                                    {isOwner && member.id !== currentUser.id && (
                                        <button 
                                            onClick={() => handleKick(member.id)}
                                            className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            title="Remove from group"
                                        >
                                            <span className="material-symbols-outlined text-lg">person_remove</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800/50 bg-slate-900/30">
                    <button 
                        onClick={onLeave}
                        className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-bold text-sm border border-red-500/20 transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">logout</span>
                        Leave Group
                    </button>
                </div>
            </div>
        </div>
    );
}

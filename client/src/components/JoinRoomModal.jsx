import { useState } from 'react';

export default function JoinRoomModal({ onClose, onJoin }) {
    const [code, setCode] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onJoin(code);
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 p-6 rounded-2xl w-full max-w-sm border border-slate-800 shadow-2xl animate-modal-scale">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">Join Room</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-1.5">Room Code</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-800 text-white rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-violet-500/50 border border-slate-700 focus:border-violet-500/50 transition-all placeholder:text-slate-600 uppercase tracking-widest text-center font-mono text-lg"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            placeholder="XA7K9B"
                            required
                            maxLength={6}
                        />
                        <p className="text-xs text-slate-500 mt-2 text-center">
                            Enter the 6-character code shared by the room owner.
                        </p>
                    </div>
                    <div className="flex gap-3 mt-8">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold shadow-lg shadow-violet-500/20 transition-all"
                        >
                            Join
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { cryptoManager } from '../lib/crypto/CryptoManager';

const DeviceIcon = ({ label }) => {
    let icon = 'devices';
    if (label?.toLowerCase().includes('mobile') || label?.toLowerCase().includes('phone') || label?.toLowerCase().includes('android') || label?.toLowerCase().includes('ios')) icon = 'smartphone';
    if (label?.toLowerCase().includes('tablet') || label?.toLowerCase().includes('ipad')) icon = 'tablet_mac';
    if (label?.toLowerCase().includes('desktop') || label?.toLowerCase().includes('mac') || label?.toLowerCase().includes('windows')) icon = 'computer';
    
    return (
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <span className="material-symbols-outlined">{icon}</span>
        </div>
    );
};

const formatTime = (isoString) => {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Active now';
    if (date.toDateString() === now.toDateString()) {
        return `Last active today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `Last active ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const formatDate = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function LinkedDevices({ onClose }) {
    const { token } = useAuth();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null); 
    const [currentDeviceId, setCurrentDeviceId] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState(null);

    useEffect(() => {
        const init = async () => {
             // Ensure crypto is init to get my ID
             if (!cryptoManager.deviceId) await cryptoManager.init();
             setCurrentDeviceId(cryptoManager.deviceId);
             await fetchDevices();
        };
        init();
    }, [token]);

    const fetchDevices = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/devices`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setDevices(data);
            }
        } catch (err) {
            console.error('Failed to fetch devices', err);
        } finally {
            setLoading(false);
        }
    };

    const performRotation = async () => {
        setStatusMessage('Scanning your conversations...');
        try {
            // 1. Fetch joined rooms
            const roomsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!roomsRes.ok) throw new Error('Failed to fetch rooms');
            const rooms = await roomsRes.json();
            
            // 2. Rotate keys for each room
            setStatusMessage('Securing your conversations...');
            
            let count = 0;
            for (let i = 0; i < rooms.length; i++) {
                const room = rooms[i];
                try {
                    await cryptoManager.rotateRoomKey(room.id, token);
                    count++;
                } catch (e) {
                    console.error('Failed to rotate room', room.id, e);
                }
            }
            console.log(`[DeviceRevocation] Rotated keys for ${count}/${rooms.length} rooms`);
            setStatusMessage('All chats secured!');
            await new Promise(r => setTimeout(r, 1000)); // Show success briefly
            setStatusMessage(null);
        } catch (err) {
            console.error('Rotation failed:', err);
            setStatusMessage('Error securing rooms');
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const confirmRevoke = (deviceId) => {
        setConfirmRevokeId(deviceId);
    };

    const executeRevoke = async () => {
        const deviceId = confirmRevokeId;
        setConfirmRevokeId(null);
        
        setActionLoading(deviceId);
        setStatusMessage('Revoking device access...');
        
        try {
            // 1. Revoke on Server
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/devices/${deviceId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                setDevices(prev => prev.filter(d => d.id !== deviceId));
                // 2. Rotate Keys
                await performRotation();
            } else {
                alert('Failed to revoke device');
            }
        } catch (err) {
            console.error(err);
            alert('Error connecting to server');
        } finally {
            setActionLoading(null);
            setStatusMessage(null);
        }
    };

    const currentDevice = devices.find(d => d.id === currentDeviceId);
    const otherDevices = devices.filter(d => d.id !== currentDeviceId);
    const deviceToRevoke = devices.find(d => d.id === confirmRevokeId);

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div 
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col animate-scale-up relative transition-colors"
                onClick={e => e.stopPropagation()}
                style={{ maxHeight: '80vh' }}
            >
                {/* Header */}
                <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onClose} 
                            disabled={!!statusMessage}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Trusted Devices</h2>
                    </div>
                </div>

                {/* Status Bar */}
                {statusMessage && (
                    <div className="px-4 py-2 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        {statusMessage}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                         <div className="space-y-4">
                            <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                            <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Current Device */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">This Device</h3>
                                {currentDevice ? (
                                    <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl p-4 flex items-center gap-3">
                                        <DeviceIcon label={currentDevice.label} />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-slate-800 dark:text-white truncate" title={currentDevice.label}>
                                                {currentDevice.label || 'Browser'}
                                            </h4>
                                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
                                                Active now
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-amber-500 text-center font-mono">
                                        Current device ID not found on server (Sync Pending?)
                                    </div>
                                )}
                            </div>

                            {/* Other Devices */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Other Devices</h3>
                                {otherDevices.length === 0 ? (
                                    <div className="text-center py-6 text-slate-400 dark:text-slate-500 italic text-sm bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                        No other trusted devices
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {otherDevices.map(device => (
                                            <div key={device.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 rounded-xl p-3 flex items-start gap-3 transition-colors group">
                                                <div className="mt-1">
                                                    <DeviceIcon label={device.label} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <h4 className="font-bold text-slate-800 dark:text-white truncate">
                                                            {device.label || 'Unknown Device'}
                                                        </h4>
                                                        <button 
                                                            onClick={() => confirmRevoke(device.id)}
                                                            disabled={!!actionLoading}
                                                            className="px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors disabled:opacity-50 shrink-0 ml-1"
                                                            title="Revoke Trust & Access"
                                                        >
                                                            {actionLoading === device.id ? '...' : 'Revoke'}
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                                                        <p className="truncate">
                                                            {formatTime(device.last_active_at)}
                                                        </p>
                                                        <p className="text-slate-300 dark:text-slate-600 font-mono text-[10px] truncate" title={device.id}>
                                                            ID: {device.id.slice(0, 8)}...
                                                        </p>
                                                        {device.signing_public_key && (
                                                            <p className="text-violet-400/70 text-[10px] flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[10px]">verified_user</span>
                                                                Signed
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Confirmation Overlay */}
                {confirmRevokeId && (
                    <div className="absolute inset-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-2xl">warning</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Revoke Access?</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-[240px]">
                                Are you sure you want to remove <span className="font-semibold text-slate-800 dark:text-slate-200">"{deviceToRevoke?.label || 'this device'}"</span>? It will lose access to your encrypted chats.
                            </p>
                            <div className="flex gap-3 w-full">
                                <button 
                                    onClick={() => setConfirmRevokeId(null)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={executeRevoke}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-500 shadow-lg hover:shadow-red-500/20 transition-all transform active:scale-95"
                                >
                                    Yes, Revoke
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

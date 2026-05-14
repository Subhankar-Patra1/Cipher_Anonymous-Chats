import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { cryptoManager } from '../lib/crypto/CryptoManager';
import { Html5Qrcode } from 'html5-qrcode';
import { io as socketIO } from 'socket.io-client';
import CipherQR from './CipherQR';

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

// Detect if user is on a mobile device
const getIsMobile = () => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.innerWidth <= 768);
};

export default function LinkedDevices({ onClose }) {
    const { token } = useAuth();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null); 
    const [currentDeviceId, setCurrentDeviceId] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState(null);
    
    // QR Scanner State (Mobile)
    const [showScanner, setShowScanner] = useState(false);
    const [scannedData, setScannedData] = useState(null);
    const [requestingDeviceInfo, setRequestingDeviceInfo] = useState(null);
    const [scanStatus, setScanStatus] = useState('idle'); // idle | scanning | confirming | success | error
    const [scanError, setScanError] = useState(null);
    const scannerRef = useRef(null);

    // QR Display State (Desktop)
    const [showQR, setShowQR] = useState(false);
    const [qrToken, setQrToken] = useState(null);
    const [qrExpiresAt, setQrExpiresAt] = useState(null);
    const [qrTimeLeft, setQrTimeLeft] = useState(0);
    const [qrStatus, setQrStatus] = useState('loading'); // loading | ready | expired | authenticated | error
    const [qrError, setQrError] = useState(null);
    const qrSocketRef = useRef(null);
    const qrPollRef = useRef(null);
    const qrTimerRef = useRef(null);

    const isMobile = getIsMobile();

    useEffect(() => {
        const init = async () => {
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
            const roomsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!roomsRes.ok) throw new Error('Failed to fetch rooms');
            const rooms = await roomsRes.json();
            
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
            await new Promise(r => setTimeout(r, 1000));
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
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/devices/${deviceId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                setDevices(prev => prev.filter(d => d.id !== deviceId));
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

    // ===== MOBILE: QR Scanner Functions =====
    const startScanner = async () => {
        setShowScanner(true);
        setScanStatus('scanning');
        setScanError(null);
        setScannedData(null);

        setTimeout(async () => {
            try {
                const html5QrCode = new Html5Qrcode('qr-scanner-container');
                scannerRef.current = html5QrCode;

                await html5QrCode.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0
                    },
                    (decodedText) => {
                        console.log("[QR Scanner] Decoded:", decodedText);
                        try {
                            const parsed = JSON.parse(decodedText);
                            if (parsed.type === 'cipher_qr_login' && parsed.token) {
                                console.log("[QR Scanner] Valid QR Token found!");
                                setScannedData(parsed);
                                setScanStatus('confirming');
                                html5QrCode.stop().catch(() => {});

                                // Fetch requesting device info
                                fetch(`${import.meta.env.VITE_API_URL}/api/auth/qr-session/${parsed.token}/status`)
                                    .then(res => res.json())
                                    .then(data => {
                                        if (data.newDeviceInfo) {
                                            setRequestingDeviceInfo(data.newDeviceInfo);
                                        }
                                    })
                                    .catch(err => console.error('[QR] Info fetch failed', err));
                            }
                        } catch (e) {
                            // Not a valid Cipher QR code, keep scanning
                        }
                    },
                    () => {} // ignore errors during scanning
                );
            } catch (err) {
                console.error('[QR Scanner] Error starting:', err);
                setScanError('Could not access camera. Please check permissions.');
                setScanStatus('error');
            }
        }, 300);
    };

    const stopScanner = () => {
        if (scannerRef.current) {
            scannerRef.current.stop().catch(() => {});
            scannerRef.current = null;
        }
        setShowScanner(false);
        setScanStatus('idle');
        setScannedData(null);
        setScanError(null);
    };

    const confirmQRLogin = async () => {
        if (!scannedData?.token) return;
        setScanStatus('confirming');
        setScanError(null);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/qr-session/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ qrToken: scannedData.token })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to confirm login');
            }

            setScanStatus('success');
            setTimeout(() => {
                stopScanner();
                fetchDevices();
            }, 1500);
        } catch (err) {
            console.error('[QR Scanner] Confirm error:', err);
            setScanError(err.message || 'Failed to confirm. Please try again.');
            setScanStatus('error');
        }
    };

    // ===== DESKTOP: QR Code Display Functions =====
    const generateQRSession = useCallback(async () => {
        setQrStatus('loading');
        setQrError(null);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/qr-session`, {
                method: 'POST'
            });
            if (!res.ok) throw new Error('Failed to create QR session');
            const data = await res.json();
            setQrToken(data.token);
            setQrExpiresAt(new Date(data.expiresAt));
            setQrStatus('ready');
            return data.token;
        } catch (err) {
            console.error('[QR Desktop] Error generating session:', err);
            setQrError('Failed to generate QR code. Check your connection.');
            setQrStatus('error');
            return null;
        }
    }, []);

    const startQRDisplay = async () => {
        setShowQR(true);
        
        const newToken = await generateQRSession();
        if (!newToken) return;

        // Connect to /qr namespace
        const socket = socketIO(`${import.meta.env.VITE_API_URL}/qr`, {
            transports: ['websocket', 'polling']
        });
        qrSocketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('qr:subscribe', { token: newToken });
        });

        socket.on('qr:authenticated', () => {
            setQrStatus('authenticated');
            if (qrPollRef.current) clearInterval(qrPollRef.current);
            if (qrTimerRef.current) clearInterval(qrTimerRef.current);
            // Refresh devices list after a delay
            setTimeout(() => {
                stopQRDisplay();
                fetchDevices();
            }, 1500);
        });

        // Fallback polling
        qrPollRef.current = setInterval(async () => {
            try {
                const statusRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/qr-session/${newToken}/status`);
                if (!statusRes.ok) return;
                const statusData = await statusRes.json();
                if (statusData.status === 'authenticated') {
                    setQrStatus('authenticated');
                    clearInterval(qrPollRef.current);
                    if (qrTimerRef.current) clearInterval(qrTimerRef.current);
                    setTimeout(() => {
                        stopQRDisplay();
                        fetchDevices();
                    }, 1500);
                } else if (statusData.status === 'expired') {
                    setQrStatus('expired');
                    clearInterval(qrPollRef.current);
                }
            } catch (_) {}
        }, 3000);
    };

    const stopQRDisplay = () => {
        if (qrSocketRef.current) {
            if (qrToken) qrSocketRef.current.emit('qr:unsubscribe', { token: qrToken });
            qrSocketRef.current.disconnect();
            qrSocketRef.current = null;
        }
        if (qrPollRef.current) clearInterval(qrPollRef.current);
        if (qrTimerRef.current) clearInterval(qrTimerRef.current);
        setShowQR(false);
        setQrToken(null);
        setQrExpiresAt(null);
        setQrTimeLeft(0);
        setQrStatus('loading');
        setQrError(null);
    };

    const handleRefreshQR = async () => {
        // Disconnect old socket
        if (qrSocketRef.current) {
            if (qrToken) qrSocketRef.current.emit('qr:unsubscribe', { token: qrToken });
            qrSocketRef.current.disconnect();
        }
        if (qrPollRef.current) clearInterval(qrPollRef.current);
        if (qrTimerRef.current) clearInterval(qrTimerRef.current);

        const newToken = await generateQRSession();
        if (!newToken) return;

        // Reconnect socket
        const socket = socketIO(`${import.meta.env.VITE_API_URL}/qr`, {
            transports: ['websocket', 'polling']
        });
        qrSocketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('qr:subscribe', { token: newToken });
        });

        socket.on('qr:authenticated', () => {
            setQrStatus('authenticated');
            if (qrPollRef.current) clearInterval(qrPollRef.current);
            if (qrTimerRef.current) clearInterval(qrTimerRef.current);
            setTimeout(() => {
                stopQRDisplay();
                fetchDevices();
            }, 1500);
        });

        // Restart polling
        qrPollRef.current = setInterval(async () => {
            try {
                const statusRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/qr-session/${newToken}/status`);
                if (!statusRes.ok) return;
                const statusData = await statusRes.json();
                if (statusData.status === 'authenticated') {
                    setQrStatus('authenticated');
                    clearInterval(qrPollRef.current);
                    if (qrTimerRef.current) clearInterval(qrTimerRef.current);
                    setTimeout(() => {
                        stopQRDisplay();
                        fetchDevices();
                    }, 1500);
                } else if (statusData.status === 'expired') {
                    setQrStatus('expired');
                    clearInterval(qrPollRef.current);
                }
            } catch (_) {}
        }, 3000);
    };

    // Countdown timer for QR display
    useEffect(() => {
        if (!qrExpiresAt || qrStatus !== 'ready') return;

        const updateTimer = () => {
            const remaining = Math.max(0, Math.ceil((qrExpiresAt.getTime() - Date.now()) / 1000));
            setQrTimeLeft(remaining);
            if (remaining <= 0) {
                setQrStatus('expired');
                if (qrPollRef.current) clearInterval(qrPollRef.current);
            }
        };

        updateTimer();
        qrTimerRef.current = setInterval(updateTimer, 1000);
        return () => clearInterval(qrTimerRef.current);
    }, [qrExpiresAt, qrStatus]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (qrSocketRef.current) {
                qrSocketRef.current.disconnect();
            }
            if (qrPollRef.current) clearInterval(qrPollRef.current);
            if (qrTimerRef.current) clearInterval(qrTimerRef.current);
        };
    }, []);

    const qrValue = qrToken ? JSON.stringify({
        type: 'cipher_qr_login',
        token: qrToken,
        server: import.meta.env.VITE_API_URL
    }) : '';

    const currentDevice = devices.find(d => d.id === currentDeviceId);
    const otherDevices = devices.filter(d => d.id !== currentDeviceId);
    const deviceToRevoke = devices.find(d => d.id === confirmRevokeId);

    // Handle "Link New Device" click based on platform
    const handleLinkDevice = () => {
        if (isMobile) {
            startScanner();
        } else {
            startQRDisplay();
        }
    };

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

                {/* Link New Device Button */}
                <div className="px-4 pb-4 shrink-0 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <button
                        onClick={handleLinkDevice}
                        disabled={!!statusMessage}
                        className="w-full py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-500/20 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="material-symbols-outlined text-lg">{isMobile ? 'qr_code_scanner' : 'qr_code'}</span>
                        Link New Device
                    </button>
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

                {/* QR Scanner Overlay (MOBILE) */}
                {showScanner && (
                    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col animate-in fade-in duration-200">
                        {/* Scanner Header */}
                        <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={stopScanner}
                                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                                >
                                    <span className="material-symbols-outlined">arrow_back</span>
                                </button>
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Scan QR Code</h2>
                            </div>
                        </div>

                        {/* Scanner Content */}
                        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative">
                            <AnimatePresence mode="wait">
                                {scanStatus === 'scanning' && (
                                    <motion.div 
                                        key="scanning"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="flex flex-col items-center w-full"
                                    >
                                        <div id="qr-scanner-container" className="w-full max-w-[280px] rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-800" />
                                        <p className="text-xs text-slate-400 mt-4 text-center">Point your camera at the QR code on the sign-in page</p>
                                    </motion.div>
                                )}

                                {scanStatus === 'confirming' && (
                                    <motion.div 
                                        key="confirming"
                                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 1.1 }}
                                        className="flex flex-col items-center text-center px-4 w-full"
                                    >
                                        <div className="w-20 h-20 rounded-3xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-6 shadow-inner">
                                            <span className="material-symbols-outlined text-4xl">devices</span>
                                        </div>
                                        
                                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Link Request</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                                            Authorize this device to access your account?
                                        </p>

                                        {/* Device Info Card */}
                                        <div className="w-full max-w-[280px] bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 mb-8 flex flex-col items-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center text-slate-500 shadow-sm transition-colors">
                                                <span className="material-symbols-outlined text-2xl">
                                                    {requestingDeviceInfo?.os?.toLowerCase().includes('windows') || requestingDeviceInfo?.os?.toLowerCase().includes('mac') ? 'computer' : 'smartphone'}
                                                </span>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                                    {requestingDeviceInfo ? `${requestingDeviceInfo.browser} on ${requestingDeviceInfo.os}` : 'Browser on Desktop'}
                                                </p>
                                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                    IP: {requestingDeviceInfo?.ip || 'Pending...'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 w-full max-w-[280px]">
                                            <button 
                                                onClick={stopScanner}
                                                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                            >
                                                Deny
                                            </button>
                                            <button 
                                                onClick={confirmQRLogin}
                                                className="flex-1 px-4 py-3 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 shadow-lg shadow-violet-500/20 transition-all transform active:scale-95"
                                            >
                                                Approve
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {scanStatus === 'success' && (
                                    <motion.div 
                                        key="success"
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <div className="relative">
                                            <motion.div 
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1.5, opacity: 0 }}
                                                transition={{ repeat: Infinity, duration: 1.5 }}
                                                className="absolute inset-0 bg-emerald-500/30 rounded-full"
                                            />
                                            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center relative z-10 shadow-lg shadow-emerald-500/40">
                                                <motion.span 
                                                    initial={{ pathLength: 0 }}
                                                    animate={{ pathLength: 1 }}
                                                    className="material-symbols-outlined text-white text-4xl"
                                                >
                                                    check
                                                </motion.span>
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-6">Device Linked!</h3>
                                        <p className="text-sm text-slate-400 mt-2">Connecting secure tunnel...</p>
                                    </motion.div>
                                )}

                                {scanStatus === 'error' && (
                                    <motion.div 
                                        key="error"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <div className="w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-4xl text-red-500">error</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Failed</h3>
                                        <p className="text-sm text-slate-400 mb-6 px-8 leading-relaxed">{scanError}</p>
                                        <button 
                                            onClick={() => { stopScanner(); startScanner(); }}
                                            className="px-6 py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-sm transition-all shadow-lg"
                                        >
                                            Try Again
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {/* QR Code Display Overlay (DESKTOP) */}
                {showQR && (
                    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col animate-in fade-in duration-200">
                        {/* QR Header */}
                        <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={stopQRDisplay}
                                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                                >
                                    <span className="material-symbols-outlined">arrow_back</span>
                                </button>
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Link New Device</h2>
                            </div>
                        </div>

                        {/* QR Content */}
                        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative">
                            <AnimatePresence mode="wait">
                                {qrStatus === 'loading' && (
                                    <motion.div 
                                        key="loading"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="flex flex-col items-center gap-3"
                                    >
                                        <div className="w-[220px] h-[220px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl">
                                            <span className="material-symbols-outlined text-slate-400 text-4xl animate-spin">progress_activity</span>
                                        </div>
                                        <p className="text-xs text-slate-400">Generating QR code...</p>
                                    </motion.div>
                                )}

                                {qrStatus === 'ready' && (
                                    <motion.div 
                                        key="ready"
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 1.1 }}
                                        className="flex flex-col items-center"
                                    >
                                        <div className="p-2">
                                            <CipherQR value={qrValue} size={220} />
                                        </div>
                                        {/* Timer */}
                                        <div className="mt-6 flex items-center gap-2">
                                            <div className="relative w-24 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div 
                                                    ref={(el) => {
                                                        if (el && qrTimeLeft > 0) {
                                                            el.style.transition = 'none';
                                                            el.style.width = `${(qrTimeLeft / 120) * 100}%`;
                                                            requestAnimationFrame(() => {
                                                                requestAnimationFrame(() => {
                                                                    el.style.transition = `width ${qrTimeLeft}s linear`;
                                                                    el.style.width = '0%';
                                                                });
                                                            });
                                                        }
                                                    }}
                                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                                                />
                                            </div>
                                            <span className="text-xs text-slate-400 font-mono tabular-nums w-8">{qrTimeLeft}s</span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-4 text-center max-w-[240px] leading-relaxed">
                                            Scan this QR code from your phone's <span className="font-semibold text-slate-600 dark:text-slate-300">Link Device</span> scanner
                                        </p>
                                    </motion.div>
                                )}

                                {qrStatus === 'expired' && (
                                    <motion.div 
                                        key="expired"
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-3xl">timer_off</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300 mb-2">QR Code Expired</h3>
                                        <p className="text-sm text-slate-400 mb-6">Generate a new one to continue</p>
                                        <button 
                                            onClick={handleRefreshQR}
                                            className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-violet-500/20 transition-all transform hover:scale-105 active:scale-95"
                                        >
                                            <span className="material-symbols-outlined text-lg">refresh</span>
                                            Refresh QR Code
                                        </button>
                                    </motion.div>
                                )}

                                {qrStatus === 'authenticated' && (
                                    <motion.div 
                                        key="authenticated"
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <div className="relative">
                                            <motion.div 
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1.5, opacity: 0 }}
                                                transition={{ repeat: Infinity, duration: 1.5 }}
                                                className="absolute inset-0 bg-emerald-500/30 rounded-full"
                                            />
                                            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center relative z-10 shadow-lg shadow-emerald-500/40">
                                                <span className="material-symbols-outlined text-white text-4xl">check</span>
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-6">Device Linked!</h3>
                                        <p className="text-sm text-slate-400 mt-2">Refreshing your profile...</p>
                                    </motion.div>
                                )}

                                {qrStatus === 'error' && (
                                    <motion.div 
                                        key="error"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <div className="w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-3xl">error</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Error</h3>
                                        <p className="text-sm text-slate-400 mb-6 px-10 leading-relaxed">{qrError}</p>
                                        <button 
                                            onClick={handleRefreshQR}
                                            className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-all shadow-lg shadow-violet-500/20"
                                        >
                                            Try Again
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

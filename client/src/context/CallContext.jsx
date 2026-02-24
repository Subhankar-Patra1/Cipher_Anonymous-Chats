import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import SimplePeer from 'simple-peer';
import { useAuth } from './AuthContext';

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children, socket }) => {
    const { user } = useAuth();

    const [callStatus, setCallStatus] = useState('idle'); // idle, calling, incoming, connected, ended
    // Helper: sync ref immediately so stale closures always see the latest status
    const updateCallStatus = (newStatus) => {
        callStatusRef.current = newStatus;
        setCallStatus(newStatus);
    };
    const [connectionStatus, setConnectionStatus] = useState('good'); // good, reconnecting, failed
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callDetails, setCallDetails] = useState(null); // { callerId, callerName, type, roomId }
    const [remoteMediaStatus, setRemoteMediaStatus] = useState({ audio: true, video: true });
    const [currentFacingMode, setCurrentFacingMode] = useState('user');
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    
    // Check for multiple cameras on mount
    const checkCameras = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            // On mobile, if no labels are present, it often means permissions haven't been granted.
            // But we can guess multiple cameras exist on most modern phones.
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            
            // If labels are available, we can be sure. If not, and it's mobile, assume it has multiple.
            const hasLabels = videoDevices.some(d => d.label);
            if (isMobile && !hasLabels) {
                setHasMultipleCameras(true); // Assume multiple on mobile if we can't tell yet
            } else {
                setHasMultipleCameras(videoDevices.length > 1);
            }
        } catch (err) {
            console.warn("Error checking cameras:", err);
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            setHasMultipleCameras(isMobile); // Default to true on mobile on error
        }
    };

    useEffect(() => {
        checkCameras();
        
        // Listen for device changes
        navigator.mediaDevices.addEventListener('devicechange', checkCameras);
        return () => navigator.mediaDevices.removeEventListener('devicechange', checkCameras);
    }, []);
    
    // Refs for mutable state in callbacks
    const connectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const incomingSignalRef = useRef(null); 
    const isBusyRef = useRef(false);
    const callDetailsRef = useRef(null); // [NEW] Ref for callbacks to avoid stale closures
    const startTimeRef = useRef(null); // [NEW] Track call duration
    const callStatusRef = useRef('idle'); // Track callStatus in ref to avoid stale closures
    const initiatedCallMessageIdRef = useRef(null); // [NEW] Track the message ID of the 'initiated' call log
    const saveCallLogPromiseRef = useRef(null); // [NEW] Track in-flight saveCallLog to prevent race conditions
    const isEndingCallRef = useRef(false); // [NEW] Re-entrancy guard for endCall

    // Audio Refs
    const ringtoneRef = useRef(new Audio('/sounds/ringtone.mp3'));
    const endSoundRef = useRef(new Audio('/sounds/end.mp3'));

    useEffect(() => {
        // Configure audio loops
        ringtoneRef.current.loop = true;
        
        return () => {
            ringtoneRef.current.pause();
            endSoundRef.current.pause();
        };
    }, []);

    useEffect(() => {
        if (callStatus === 'incoming') {
            ringtoneRef.current.currentTime = 0;
            ringtoneRef.current.play().catch(e => console.warn("Autoplay blocked:", e));
        } else {
            ringtoneRef.current.pause();
            if (callStatus === 'ended') {
                endSoundRef.current.currentTime = 0;
                endSoundRef.current.play().catch(e => console.warn("Autoplay blocked:", e));
            }
        }
        
        isBusyRef.current = (callStatus !== 'idle' && callStatus !== 'ended');
    }, [callStatus]);

    useEffect(() => {
        if (!socket) return;

        socket.on('call:invite', ({ from, signal, type, roomId, callerName, callerAvatar }) => {
            if (isBusyRef.current) {
                socket.emit('call:busy', { to: from });
                return;
            }

            const details = { callerId: from, callerName, callerAvatar, type, roomId };
            setCallDetails(details);
            callDetailsRef.current = details;
            updateCallStatus('incoming');
            incomingSignalRef.current = signal;
        });

        socket.on('call:accepted', ({ signal }) => {
            updateCallStatus('connected');
            startTimeRef.current = Date.now(); // [NEW] Start timer
            // [NEW] Update call log to 'connected' so sidebar shows "In call"
            if (callDetailsRef.current) {
                saveCallLog(callDetailsRef.current, 'connected');
            }
            if (connectionRef.current) {
                connectionRef.current.signal(signal);
            }
        });

        socket.on('call:busy', () => {
            alert("User is busy on another call.");
            endCall();
        });

        socket.on('call:ended', () => {
            endCall();
        });

        socket.on('call:media-toggle', ({ audio, video }) => {
            setRemoteMediaStatus({ audio, video });
        });

        return () => {
            socket.off('call:invite');
            socket.off('call:accepted');
            socket.off('call:busy');
            socket.off('call:ended');
            socket.off('call:media-toggle');
        };
    }, [socket]);

    // [NEW] Listen for external call initiation (e.g. from MessageList)
    const initiateCallRef = useRef(null);
    
    useEffect(() => {
        const handleInitiateCall = (e) => {
            const { userId, roomId, type, targetName, targetAvatar } = e.detail;
            initiateCallRef.current(userId, roomId, type, targetName, targetAvatar);
        };
        window.addEventListener('cipher:initiate-call', handleInitiateCall);
        return () => window.removeEventListener('cipher:initiate-call', handleInitiateCall);
    }, []);

    const saveCallLog = async (details, status, duration = 0) => {
        if (!details || !user || !socket) return;
        
        // ONLY the caller logs the call to DB and sends the chat message to avoid duplicates
        if (!details.isOutgoing) return;

        try {
            const token = localStorage.getItem('token');
            const targetId = details.targetId;
            
            // 1. Create Call Log in DB — only on FINAL statuses (not initiated/connected)
            const isFinalStatus = ['completed', 'missed', 'cancelled', 'declined', 'busy'].includes(status);
            if (isFinalStatus) {
                await fetch(`${import.meta.env.VITE_API_URL}/api/calls`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        receiver_id: targetId,
                        room_id: details.roomId,
                        type: details.type,
                        status: status,
                        duration: duration,
                        ended_at: new Date().toISOString()
                    })
                });
                // [NEW] Notify CallHistory to refresh
                window.dispatchEvent(new CustomEvent('cipher:call-log-saved'));
            }

            // 2. Build a human-readable content label for the sidebar preview
            const callLabel = status === 'completed' ? 'Call ended'
                : status === 'missed' ? 'Missed call'
                : status === 'cancelled' ? 'Cancelled call'
                : status === 'declined' ? 'Declined call'
                : status === 'busy' ? 'Busy'
                : status === 'connected' ? (details.type === 'video' ? 'Video call' : 'Voice call')
                : status === 'initiated' ? (details.type === 'video' ? 'Video call' : 'Voice call')
                : 'Call ended';

            // 3. Send "Call Log" message to the chat room
            if (details.roomId) {
                const meta = {
                    call_type: details.type,
                    call_status: status,
                    duration: duration,
                    caller_id: user.id,
                    target_id: details.targetId,
                    target_name: details.callerName || null,
                    target_avatar: details.callerAvatar || null
                };
                
                const isUpdate = status !== 'initiated' && initiatedCallMessageIdRef.current;
                const url = isUpdate 
                    ? `${import.meta.env.VITE_API_URL}/api/messages/${initiatedCallMessageIdRef.current}`
                    : `${import.meta.env.VITE_API_URL}/api/messages`;
                
                const response = await fetch(url, {
                    method: isUpdate ? 'PATCH' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        room_id: details.roomId,
                        type: 'call_log',
                        content: callLabel,
                        caption: JSON.stringify(meta)
                    })
                });

                if (response.ok) {
                    const savedMsg = await response.json();
                    if (status === 'initiated' && savedMsg.id) {
                        initiatedCallMessageIdRef.current = savedMsg.id;
                    }
                }
            }

        } catch (err) {
            console.error("Failed to save call log:", err);
        }
    };

    const getMediaConstraints = (type) => {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (type === 'audio') {
            return {
                video: false,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
        }

        if (isMobile) {
            return {
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 }, // HD Quality
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 } // Relaxed frameRate (removed max)
                }
            };
        }
        
        // Desktop defaults (Full HD)
        return { 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }, 
            video: { 
                width: { ideal: 1920 }, 
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            } 
        };
    };

    /**
     * Robust wrapper for getUserMedia with resolution fallbacks
     */
    const getSafeUserMedia = async (type) => {
        const primaryConstraints = getMediaConstraints(type);
        
        // If audio only, no fallback needed for resolution
        if (type === 'audio') {
            return await navigator.mediaDevices.getUserMedia(primaryConstraints);
        }

        try {
            // Level 1: Try HD/Full HD (as requested)
            console.log('[CallContext] Attempting Level 1 Media (HD/FHD)...');
            return await navigator.mediaDevices.getUserMedia(primaryConstraints);
        } catch (err) {
            console.warn('[CallContext] Level 1 Media failed:', err.name, err.message);
            
            // If device is in use, resolution fallbacks might not help, 
            // but sometimes a specific mode (like FHD) is locked by another app while HD is free.
            if (err.name === 'NotReadableError') {
                console.log('[CallContext] Device busy, trying mid-tier fallback...');
            }

            try {
                // Level 2: Try standard 720p (if not already tried) or lower
                console.log('[CallContext] Attempting Level 2 Media (720p)...');
                const level2Constraints = {
                    audio: primaryConstraints.audio,
                    video: { 
                        width: { ideal: 1280 }, 
                        height: { ideal: 720 },
                        frameRate: { ideal: 24 }
                    }
                };
                return await navigator.mediaDevices.getUserMedia(level2Constraints);
            } catch (err2) {
                console.error('[CallContext] Level 2 Media failed:', err2.name);
                
                try {
                    // Level 3: Bare minimum 360p
                    console.log('[CallContext] Attempting Level 3 Media (360p)...');
                    const level3Constraints = {
                        audio: primaryConstraints.audio,
                        video: { width: 640, height: 360 }
                    };
                    return await navigator.mediaDevices.getUserMedia(level3Constraints);
                } catch (err3) {
                    // If all video attempts fail, throw the original error or a descriptive one
                    console.error('[CallContext] All video levels failed.');
                    throw err; 
                }
            }
        }
    };

    const attachConnectionMonitoring = (peer) => {
        if (!peer) return;
        
        // Monitor ICE connection state for "Reconnecting..." UI
        const checkIceState = () => {
            if (peer && peer._pc) {
                const state = peer._pc.iceConnectionState;
                console.log('[CallContext] ICE State:', state);
                
                if (state === 'disconnected' || state === 'checking') {
                    // Start attempting to reconnect visually
                    setConnectionStatus('reconnecting');
                } else if (state === 'connected' || state === 'completed') {
                    setConnectionStatus('good');
                } else if (state === 'failed' || state === 'closed') {
                    setConnectionStatus('failed');
                }
            }
        };

        // We can attach immediately if _pc exists, or wait for connect?
        // simple-peer creates _pc in constructor, so it should be there.
        if (peer._pc) {
            peer._pc.oniceconnectionstatechange = checkIceState;
            peer._pc.onconnectionstatechange = () => {
                 console.log('[CallContext] Connection State:', peer._pc.connectionState);
            };
        }
        
        // Also listen for general peer events
        peer.on('connect', () => {
            setConnectionStatus('good');
            
            // Refresh camera list once we have permission
            checkCameras();

            // [NEW] Sync initial media status immediately on connect so remote side shows avatar if our camera is off
            const target = callDetailsRef.current?.isOutgoing ? callDetailsRef.current.targetId : callDetailsRef.current?.callerId;
            if (target && socket && localStreamRef.current) {
                socket.emit('call:media-toggle', { 
                    to: target, 
                    audio: localStreamRef.current.getAudioTracks()[0]?.enabled ?? true, 
                    video: localStreamRef.current.getVideoTracks()[0]?.enabled ?? false
                });
            }
        });
    };

    const initiateCall = async (userId, roomId, type, targetName, targetAvatar) => {
        let stream = null;
        try {
            stream = await getSafeUserMedia(type);
        } catch (err) {
            console.error("Media Access denied:", err);
            if (err.name === 'NotReadableError') {
                alert("Camera or Microphone is already in use by another application. Please close other apps (like Zoom, Teams, or other browser tabs) and try again.");
            } else {
                alert("Could not access camera/microphone. Please check permissions.");
            }
            return;
        }

        try {
            setLocalStream(stream);
            localStreamRef.current = stream;
            updateCallStatus('calling');
            setConnectionStatus('good');
            
            // [FIX] For outgoing calls, we store the TARGET'S details for display 
            // but send OUR details in the signal so they see us.
            const details = { 
                callerId: user.id, 
                type, 
                roomId, 
                isOutgoing: true, 
                targetId: userId, 
                callerName: targetName || "User", 
                callerAvatar: targetAvatar || null 
            };
            setCallDetails(details);
            callDetailsRef.current = details;

            // [NEW] Save log immediately as "initiated" so it shows up in chat window
            // [FIX] Track the promise so endCall can await it before PATCHing
            saveCallLogPromiseRef.current = saveCallLog(details, 'initiated');

            const peer = new SimplePeer({
                initiator: true,
                trickle: false,
                stream: stream
            });

            // [NEW] Register call with server for disconnect handling
            if (socket) {
                socket.emit('call:register', { targetUserId: userId });
            }

            attachConnectionMonitoring(peer);

            peer.on('signal', (data) => {
                socket.emit('call:invite', {
                    to: userId, 
                    signal: data,
                    type,
                    roomId,
                    callerName: user.display_name || user.username || "User", // Send OUR name
                    callerAvatar: user.avatar_url || user.avatar_thumb_url || user.profile_picture || user.avatar // Send OUR avatar
                });
            });

            peer.on('stream', (currentRemoteStream) => {
                 setRemoteStream(currentRemoteStream);
            });
            
            peer.on('close', () => {
                endCall();
            });

            peer.on('error', (err) => {
                console.error("Peer error:", err);
                endCall();
            });

            connectionRef.current = peer;

            // Timeout if no answer
            setTimeout(() => {
                if (callStatus === 'calling') { 
                    // Manual timeout logic could go here
                }
            }, 30000);

        } catch (err) {
            console.error("Call initialization failed:", err);
            alert("Failed to start call: " + (err.message || "Unknown error"));
            updateCallStatus('idle');
            setConnectionStatus('good');
            if (stream) {
                 stream.getTracks().forEach(t => t.stop());
            }
        }
    };

    // Update the ref after initiateCall is defined to avoid ReferenceError
    initiateCallRef.current = initiateCall;

    const answerCall = async () => {
        let stream = null;
        try {
            stream = await getSafeUserMedia(callDetails.type);
        } catch (err) {
            console.error("Media Access denied:", err);
            if (err.name === 'NotReadableError') {
                alert("Camera or Microphone is already in use by another application. Please close other apps and try again.");
            } else {
                alert("Could not access camera/microphone. Please check permissions.");
            }
            endCall();
            return;
        }

        try {
            setLocalStream(stream);
            localStreamRef.current = stream;
            updateCallStatus('connected');
            startTimeRef.current = Date.now(); // [NEW] Start timer
            setConnectionStatus('good');

            // Refresh camera list once we have permission
            checkCameras();

            const peer = new SimplePeer({
                initiator: false,
                trickle: false,
                stream: stream
            });
            
            
            // [NEW] Register call with server for disconnect handling
            if (socket && callDetails?.callerId) {
                socket.emit('call:register', { targetUserId: callDetails.callerId });
            }

            attachConnectionMonitoring(peer);

            peer.on('signal', (data) => {
                socket.emit('call:accept', { 
                    signal: data, 
                    to: callDetails.callerId 
                });
            });

            peer.on('stream', (currentRemoteStream) => {
                setRemoteStream(currentRemoteStream);
            });
            
             peer.on('close', () => {
                endCall();
            });

            connectionRef.current = peer;
            
            if (incomingSignalRef.current) {
                peer.signal(incomingSignalRef.current);
            }

        } catch (err) {
            console.error("Call answer failed:", err);
            alert("Failed to answer call: " + (err.message || "Unknown error"));
            endCall();
            if (stream) {
                 stream.getTracks().forEach(t => t.stop());
            }
        }
    };

    const endCall = async () => {
        // [FIX] Re-entrancy guard: endCall can be triggered multiple times
        // (user action, peer.on('close'), socket 'call:ended') — only save log once
        if (isEndingCallRef.current) return;
        isEndingCallRef.current = true;

        // Use ref to get the LATEST callStatus (avoids stale closure from socket/peer handlers)
        const currentStatus = callStatusRef.current;
        
        let duration = 0;
        let pStatus = 'missed';
        
        if (currentStatus === 'connected' && startTimeRef.current) {
            duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
            pStatus = 'completed';
        } else if (currentStatus === 'calling') {
            // Caller hung up / no answer
            pStatus = 'cancelled';
        } else if (currentStatus === 'incoming') {
            // Receiver declined or didn't pick up
            pStatus = 'declined';
        } else if (currentStatus === 'missed' || currentStatus === 'rejected') {
            pStatus = 'missed';
        }
        
        // [FIX] Wait for the initial 'initiated' saveCallLog to finish before creating the final log.
        // This ensures initiatedCallMessageIdRef.current is set, so we PATCH instead of creating a duplicate POST.
        if (saveCallLogPromiseRef.current) {
            try {
                await saveCallLogPromiseRef.current;
            } catch (e) {
                console.warn('[CallContext] Initial saveCallLog failed:', e);
            }
            saveCallLogPromiseRef.current = null;
        }
        
        // [FIX] Capture and clear details BEFORE destroy() to prevent re-entrant calls from saving again
        const detailsSnapshot = callDetailsRef.current;
        callDetailsRef.current = null;

        // Save log if we have details
        if (detailsSnapshot) {
            saveCallLog(detailsSnapshot, pStatus, duration);
        }

        if (connectionRef.current) {
            connectionRef.current.destroy();
        }
        
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Notify other user if we were the ones initiating or active
        if (currentStatus === 'calling' || currentStatus === 'connected' || currentStatus === 'incoming') {
             // We need to know who to notify. 
             // If we are caller, notify target. If we are receiver, notify caller.
             const target = detailsSnapshot?.isOutgoing ? detailsSnapshot.targetId : detailsSnapshot?.callerId;
             if (target && socket) {
                 socket.emit('call:end', { to: target });
             }
        }

        updateCallStatus('ended');
        setLocalStream(null);
        setRemoteStream(null);
        setCallDetails(null);
        startTimeRef.current = null; // Reset
        setRemoteMediaStatus({ audio: true, video: true });
        setCurrentFacingMode('user');
        connectionRef.current = null;
        localStreamRef.current = null;
        incomingSignalRef.current = null;

        // Reset to idle after a moment to show "Ended" screen or immediately
        setTimeout(() => {
            updateCallStatus('idle');
            initiatedCallMessageIdRef.current = null; // [NEW] Clear message ID tracking
            saveCallLogPromiseRef.current = null; // [NEW] Clear promise tracking
            isEndingCallRef.current = false; // [NEW] Allow future calls
        }, 2000);
    };

    const toggleAudio = (active) => {
         if (localStreamRef.current) {
             const audioTrack = localStreamRef.current.getAudioTracks()[0];
             if (audioTrack) audioTrack.enabled = active;
             
             // Signal to other user
             const target = callDetails?.isOutgoing ? callDetails.targetId : callDetails?.callerId;
             if (target && socket) {
                 socket.emit('call:media-toggle', { to: target, audio: active, video: localStreamRef.current.getVideoTracks()[0]?.enabled ?? false });
             }
         }
    };

    const toggleVideo = (active) => {
        if (localStreamRef.current) {
             const videoTrack = localStreamRef.current.getVideoTracks()[0];
             if (videoTrack) videoTrack.enabled = active;

             // Signal to other user
             const target = callDetails?.isOutgoing ? callDetails.targetId : callDetails?.callerId;
             if (target && socket) {
                 socket.emit('call:media-toggle', { to: target, audio: localStreamRef.current.getAudioTracks()[0]?.enabled ?? true, video: active });
             }
        }
    };

    const switchCamera = async () => {
        if (!localStreamRef.current) return;

        const newMode = currentFacingMode === 'user' ? 'environment' : 'user';
        
        try {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const constraints = {
                video: { 
                    facingMode: { exact: newMode }, // Use 'exact' to force the specific camera
                    width: isMobile ? { ideal: 1280 } : { ideal: 1920 },
                    height: isMobile ? { ideal: 720 } : { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: false
            };

            // Get the new video track
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            // Get the current video track from the stream
            const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];

            if (!currentVideoTrack) {
                console.error('[Call] No current video track found');
                newVideoTrack.stop();
                return;
            }

            // Replace track in the peer connection
            if (connectionRef.current) {
                try {
                    connectionRef.current.replaceTrack(currentVideoTrack, newVideoTrack, localStreamRef.current);
                } catch (replaceErr) {
                    console.warn('[Call] replaceTrack failed, trying alternative method:', replaceErr);
                    // Fallback: Some versions of simple-peer might not have replaceTrack
                }
            }

            // Stop the old track
            currentVideoTrack.stop();
            
            // Update the stream: remove old track and add new one
            localStreamRef.current.removeTrack(currentVideoTrack);
            localStreamRef.current.addTrack(newVideoTrack);

            // Update state to trigger re-render of local video
            setLocalStream(localStreamRef.current);
            setCurrentFacingMode(newMode);
            
            // Notify remote about the video state
            const target = callDetails?.isOutgoing ? callDetails.targetId : callDetails?.callerId;
            if (target && socket) {
                socket.emit('call:media-toggle', { 
                    to: target, 
                    audio: localStreamRef.current.getAudioTracks()[0]?.enabled ?? true, 
                    video: true 
                });
            }

            console.log(`[Call] Switched camera to ${newMode}`);
        } catch (err) {
            console.error("[Call] Failed to switch camera:", err);
            // If 'exact' constraint fails, try with 'ideal' as fallback
            if (err.name === 'OverconstrainedError') {
                try {
                    const fallbackConstraints = {
                        video: { 
                            facingMode: { ideal: newMode }
                        },
                        audio: false
                    };
                    const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                    const fallbackTrack = fallbackStream.getVideoTracks()[0];
                    const currentTrack = localStreamRef.current.getVideoTracks()[0];
                    
                    if (connectionRef.current && currentTrack) {
                        connectionRef.current.replaceTrack(currentTrack, fallbackTrack, localStreamRef.current);
                    }
                    
                    currentTrack?.stop();
                    localStreamRef.current.removeTrack(currentTrack);
                    localStreamRef.current.addTrack(fallbackTrack);
                    setLocalStream(localStreamRef.current);
                    setCurrentFacingMode(newMode);
                    console.log(`[Call] Switched camera to ${newMode} (fallback)`);
                    return;
                } catch (fallbackErr) {
                    console.error("[Call] Fallback switch also failed:", fallbackErr);
                }
            }
            alert("Could not switch camera. This might happen if your device only has one camera or permissions were denied.");
        }
    };

    return (
        <CallContext.Provider value={{ 
            callStatus, 

            connectionStatus,
            localStream, 
            remoteStream, 
            callDetails,
            initiateCall,
            answerCall,
            endCall,
            toggleAudio,
            toggleVideo,
            switchCamera,
            remoteMediaStatus,
            currentFacingMode,
            hasMultipleCameras
        }}>
            {children}
        </CallContext.Provider>
    );
};

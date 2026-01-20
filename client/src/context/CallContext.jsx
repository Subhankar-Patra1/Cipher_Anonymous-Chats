import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import SimplePeer from 'simple-peer';
import { useAuth } from './AuthContext';

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children, socket }) => {
    const { user } = useAuth();

    const [callStatus, setCallStatus] = useState('idle'); // idle, calling, incoming, connected, ended
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callDetails, setCallDetails] = useState(null); // { callerId, callerName, type, roomId }
    
    // Refs for mutable state in callbacks
    const connectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const incomingSignalRef = useRef(null); 
    const isBusyRef = useRef(false);

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

            setCallDetails({ callerId: from, callerName, callerAvatar, type, roomId });
            setCallStatus('incoming');
            incomingSignalRef.current = signal;
        });

        socket.on('call:accepted', ({ signal }) => {
            setCallStatus('connected');
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

        return () => {
            socket.off('call:invite');
            socket.off('call:accepted');
            socket.off('call:busy');
            socket.off('call:ended');
        };
    }, [socket]);

    const initiateCall = async (userId, roomId, type, targetName, targetAvatar) => {
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: type === 'video', 
                audio: true 
            });
        } catch (err) {
            console.error("Media Access denied:", err);
            alert("Could not access camera/microphone. Please check permissions.");
            return;
        }

        try {
            setLocalStream(stream);
            localStreamRef.current = stream;
            setCallStatus('calling');
            
            // [FIX] For outgoing calls, we store the TARGET'S details for display 
            // but send OUR details in the signal so they see us.
            setCallDetails({ 
                callerId: user.id, 
                type, 
                roomId, 
                isOutgoing: true, 
                targetId: userId, 
                callerName: targetName || "User", // Display target name to us
                callerAvatar: targetAvatar // Display target avatar to us
            });

            const peer = new SimplePeer({
                initiator: true,
                trickle: false,
                stream: stream
            });

            peer.on('signal', (data) => {
                socket.emit('call:invite', {
                    to: userId, 
                    signal: data,
                    type,
                    roomId,
                    callerName: user.username || "User", // Send OUR name
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
            setCallStatus('idle');
            if (stream) {
                 stream.getTracks().forEach(t => t.stop());
            }
        }
    };

    const answerCall = async () => {
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: callDetails.type === 'video', 
                audio: true 
            });
        } catch (err) {
            console.error("Media Access denied:", err);
            alert("Could not access camera/microphone. Please check permissions.");
            endCall();
            return;
        }

        try {
            setLocalStream(stream);
            localStreamRef.current = stream;
            setCallStatus('connected');

            const peer = new SimplePeer({
                initiator: false,
                trickle: false,
                stream: stream
            });

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

    const endCall = () => {
        if (connectionRef.current) {
            connectionRef.current.destroy();
        }
        
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Notify other user if we were the ones initiating or active
        if (callStatus === 'calling' || callStatus === 'connected' || callStatus === 'incoming') {
             // We need to know who to notify. 
             // If we are caller, notify target. If we are receiver, notify caller.
             const target = callDetails?.isOutgoing ? callDetails.targetId : callDetails?.callerId;
             if (target && socket) {
                 socket.emit('call:end', { to: target });
             }
        }

        setCallStatus('ended');
        setLocalStream(null);
        setRemoteStream(null);
        setCallDetails(null);
        connectionRef.current = null;
        localStreamRef.current = null;
        incomingSignalRef.current = null;

        // Reset to idle after a moment to show "Ended" screen or immediately
        setTimeout(() => setCallStatus('idle'), 2000);
    };

    const toggleAudio = (active) => {
         if (localStreamRef.current) {
             const audioTrack = localStreamRef.current.getAudioTracks()[0];
             if (audioTrack) audioTrack.enabled = active;
         }
    };

    const toggleVideo = (active) => {
        if (localStreamRef.current) {
             const videoTrack = localStreamRef.current.getVideoTracks()[0];
             if (videoTrack) videoTrack.enabled = active;
        }
    };

    return (
        <CallContext.Provider value={{ 
            callStatus, 
            localStream, 
            remoteStream, 
            callDetails,
            initiateCall,
            answerCall,
            endCall,
            toggleAudio,
            toggleVideo
        }}>
            {children}
        </CallContext.Provider>
    );
};

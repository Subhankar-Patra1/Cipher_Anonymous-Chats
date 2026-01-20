import React, { useEffect, useState, useRef } from 'react';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import { useCall } from '../context/CallContext';

const CallModal = () => {
    const { callStatus, localStream, remoteStream, callDetails, answerCall, endCall, toggleAudio, toggleVideo } = useCall();
    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [duration, setDuration] = useState(0);
    const [localVideoPos, setLocalVideoPos] = useState({ x: 0, y: 0 });
    const [isDraggingLocal, setIsDraggingLocal] = useState(false);
    const localVideoDragStart = useRef({ x: 0, y: 0 });
    const localVideoContainerRef = useRef(null);
    const callAreaRef = useRef(null);

    // Call Timer
    useEffect(() => {
        let timer;
        if (callStatus === 'connected') {
            timer = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);
        } else {
            setDuration(0);
        }
        return () => clearInterval(timer);
    }, [callStatus]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (callDetails?.type === 'audio') {
            setIsVideoOn(false);
        }
    }, [callDetails]);

    const handleToggleAudio = () => {
        setIsMicOn(!isMicOn);
        toggleAudio(!isMicOn);
    };

    const handleToggleVideo = () => {
        setIsVideoOn(!isVideoOn);
        toggleVideo(!isVideoOn);
    };

    // Floating Window Logic
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [size, setSize] = useState({ width: 320, height: 192 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    
    // Initial Position
    useEffect(() => {
        if (isMinimized) {
            setPosition({
                x: window.innerWidth - 340,
                y: window.innerHeight - 212
            });
        }
    }, [isMinimized]);

    // Drag & Resize Handlers
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) {
                setPosition({
                    x: e.clientX - dragStart.current.x,
                    y: e.clientY - dragStart.current.y
                });
            }
            if (isResizing) {
                const dx = e.clientX - dragStart.current.x;
                const dy = e.clientY - dragStart.current.y;
                setSize({
                    width: Math.max(200, dragStart.current.w + dx),
                    height: Math.max(150, dragStart.current.h + dy)
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing]);

    const handleMouseDown = (e) => {
        // Only drag if clicking the container background, not buttons
        if (isMinimized && !e.target.closest('button')) {
            e.preventDefault(); // Prevent text selection
            setIsDragging(true);
            dragStart.current = {
                x: e.clientX - position.x,
                y: e.clientY - position.y
            };
        }
    };

    const handleLocalMouseDown = (e) => {
        e.stopPropagation();
        if (!e.target.closest('button')) {
            setIsDraggingLocal(true);
            localVideoDragStart.current = {
                x: e.clientX - localVideoPos.x,
                y: e.clientY - localVideoPos.y
            };
        }
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDraggingLocal) {
                const callArea = callAreaRef.current;
                const localVideo = localVideoContainerRef.current;
                
                if (callArea && localVideo) {
                    const areaRect = callArea.getBoundingClientRect();
                    const videoRect = localVideo.getBoundingClientRect();
                    
                    let proposedX = e.clientX - localVideoDragStart.current.x;
                    let proposedY = e.clientY - localVideoDragStart.current.y;

                    // Initial position (bottom-6 right-6) values are roughly 24px from edges
                    const offsetFromEdge = 24;
                    
                    // The video's left position relative to areaRect.left is:
                    // (areaRect.width - videoRect.width - offsetFromEdge) + proposedX
                    
                    const currentLeftRel = (areaRect.width - videoRect.width - offsetFromEdge) + proposedX;
                    const currentTopRel = (areaRect.height - videoRect.height - offsetFromEdge) + proposedY;

                    // Bound checks
                    let clampedX = proposedX;
                    let clampedY = proposedY;

                    // Keep within left/right bounds
                    if (currentLeftRel < 0) {
                        clampedX = -(areaRect.width - videoRect.width - offsetFromEdge);
                    } else if (currentLeftRel + videoRect.width > areaRect.width) {
                        clampedX = offsetFromEdge;
                    }

                    // Keep within top/bottom bounds
                    if (currentTopRel < 0) {
                        clampedY = -(areaRect.height - videoRect.height - offsetFromEdge);
                    } else if (currentTopRel + videoRect.height > areaRect.height) {
                        clampedY = offsetFromEdge;
                    }
                    
                    setLocalVideoPos({
                        x: clampedX,
                        y: clampedY
                    });
                }
            }
        };

        const handleMouseUp = () => {
            setIsDraggingLocal(false);
        };

        if (isDraggingLocal) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingLocal]);

    const handleResizeDown = (e) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent text selection
        setIsResizing(true);
        dragStart.current = {
            x: e.clientX,
            y: e.clientY,
            w: size.width,
            h: size.height
        };
    };

    // Video Refs for stable stream assignment
    const minimizedVideoRef = useRef(null);
    const minimizedLocalVideoRef = useRef(null); // New ref for local video in minimized view
    const remoteAudioRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const localVideoRef = useRef(null);

    // Sync streams to video elements
    useEffect(() => {
        // Main minimized video (Remote)
        if (minimizedVideoRef.current && (remoteStream || localStream)) {
            minimizedVideoRef.current.srcObject = remoteStream || localStream;
        }
    }, [isMinimized, remoteStream, localStream]);

    useEffect(() => {
        // PIP minimized video (Local)
        if (minimizedLocalVideoRef.current && localStream) {
            minimizedLocalVideoRef.current.srcObject = localStream;
        }
    }, [isMinimized, localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream && callDetails?.type === 'video') {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [isMinimized, remoteStream, callStatus, callDetails?.type]);

    useEffect(() => {
        if (remoteAudioRef.current && remoteStream && callDetails?.type === 'audio') {
            remoteAudioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, callStatus, callDetails?.type]);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [isMinimized, localStream, callStatus]);

    if (callStatus === 'idle' || !callDetails) return null;

    // Render Avatar Logic
    const renderAvatar = (size = "large") => {
        const hasAvatar = !!callDetails.callerAvatar;
        
        return (
            <div className={`relative rounded-full flex items-center justify-center shadow-2xl overflow-hidden transition-all duration-500 ${size === 'large' ? 'w-32 h-32 md:w-40 md:h-40 border-4 border-white/10' : 'w-16 h-16'} ${!hasAvatar ? 'bg-gradient-to-br from-violet-500 to-fuchsia-600' : 'bg-slate-800'}`}>
                {hasAvatar ? (
                    <img src={callDetails.callerAvatar} alt="Caller" className="w-full h-full object-cover" />
                ) : (
                    <span className={`material-symbols-outlined text-white ${size === 'large' ? 'text-6xl' : 'text-2xl'}`}>
                        person
                    </span>
                )}
                
                {/* Ripple Effect (Pulse for calling states) */}
                {(callStatus === 'calling' || callStatus === 'incoming') && (
                    <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                )}
            </div>
        );
    };

    return (
        <div 
            ref={callAreaRef}
            style={isMinimized ? { 
                top: position.y, 
                left: position.x, 
                width: size.width, 
                height: size.height,
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none' // Prevent selection within the modal
            } : {}}
            onMouseDown={handleMouseDown}
            className={`fixed z-[9999] ${
                isMinimized 
                ? 'rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10' 
                : 'inset-0 flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl transition-all duration-500 ease-in-out'
            }`}
        >
            {/* Hidden Audio for Audio Calls */}
            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

            {/* Background Ambient Glow (Full Screen Only) */}
            {!isMinimized && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[128px] animate-pulse-slow"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-fuchsia-600/10 rounded-full blur-[128px] animate-pulse-slow delay-1000"></div>
                </div>
            )}

            {/* Minimized View */}
            {isMinimized && (
                <div className="relative w-full h-full bg-slate-900 group">
                    {/* Video Stream or Avatar */}
                    {callDetails.type === 'video' && (remoteStream || localStream) ? (
                        <>
                            <video 
                                playsInline 
                                autoPlay 
                                ref={minimizedVideoRef}
                                className="w-full h-full object-cover"
                            />
                            {/* Local Video PIP in Minimized Mode */}
                            {localStream && (
                                <div className="absolute bottom-2 right-2 w-20 h-28 bg-black/50 rounded-lg overflow-hidden shadow-lg border border-white/20 z-10">
                                    <video 
                                        playsInline 
                                        autoPlay 
                                        muted 
                                        ref={minimizedLocalVideoRef}
                                        className="w-full h-full object-cover transform scale-x-[-1]"
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="w-full h-full flex flex-row items-center p-4 gap-4 bg-slate-800">
                             {/* Small Avatar */}
                             <div className="shrink-0">
                                {renderAvatar('small')}
                             </div>
                             {/* Info */}
                             <div className="flex-1 min-w-0">
                                 <h3 className="font-bold text-white truncate text-sm flex items-center gap-1">
                                    {renderTextWithEmojis('@' + callDetails.callerName, '1.1em')}
                                 </h3>
                                 <p className="text-xs text-green-400 font-mono">{formatTime(duration)}</p>
                             </div>
                        </div>
                    )}
                    
                    {/* Overlay Controls (Always accessible on hover, separated) */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 backdrop-blur-sm">
                        <button 
                            onClick={() => setIsMinimized(false)} 
                            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-md transition-transform hover:scale-110"
                            title="Maximize"
                        >
                            <span className="material-symbols-outlined text-xl">fullscreen</span>
                        </button>
                        <button 
                            onClick={endCall} 
                            className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-110"
                            title="End Call"
                        >
                            <span className="material-symbols-outlined text-xl">call_end</span>
                        </button>
                    </div>

                    {/* Resize Handle */}
                    <div 
                        onMouseDown={handleResizeDown}
                        className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-50 flex items-end justify-end p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <div className="w-2 h-2 border-b-2 border-r-2 border-white/50 rounded-br-sm"></div>
                    </div>
                </div>
            )}

            {/* Full Screen View */}
            {!isMinimized && (
                <div 
                    ref={callAreaRef}
                    className="relative w-full max-w-sm md:max-w-4xl h-full md:h-auto md:aspect-video bg-transparent md:bg-white/5 md:border md:border-white/10 md:rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-2xl animate-fade-in-up"
                >
                    
                        {/* Main Content Area */}
                    <div className="relative flex-1 flex flex-col items-center justify-center pt-4 pb-0 md:pt-8 md:pb-2 text-center text-white">
                        
                        {/* Dynamic Status Header */}
                        <div className="absolute top-6 left-0 right-0 flex justify-between px-8 z-20">
                            {/* Hide badge in calling/incoming to keep center focus clean */}
                            {callStatus === 'connected' ? (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-xs font-medium tracking-wide">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                    {callDetails.type === 'video' ? 'VIDEO CALL' : 'AUDIO CALL'}
                                </div>
                            ) : <div></div>}
                            
                            <button 
                                onClick={() => setIsMinimized(true)} 
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center shrink-0"
                            >
                                <span className="material-symbols-outlined text-lg">expand_more</span>
                            </button>
                        </div>

                        {/* Video Layer (If Connected & Video) */}
                        {callStatus === 'connected' && callDetails.type === 'video' && remoteStream && (
                            <div className="absolute inset-0 z-0">
                                <video 
                                    playsInline 
                                    autoPlay 
                                    ref={remoteVideoRef}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80"></div>
                            </div>
                        )}

                        {/* Content Layer */}
                        <div className="relative z-10 w-full h-full flex flex-col justify-between items-center pt-8 pb-0 md:pt-12 md:pb-2">
                            
                            {/* Top Section: Name, Status, Avatar */}
                            <div className="flex flex-col items-center mt-2 w-full px-6">
                                <h2 className="text-2xl md:text-3xl font-bold mb-1 tracking-tight text-shadow-sm flex items-center justify-center gap-2 leading-tight text-center">
                                    {renderTextWithEmojis((callDetails.callerName || 'User').startsWith('@') ? (callDetails.callerName || 'User') : `@${callDetails.callerName || 'User'}`, '1.1em')}
                                </h2>
                                
                                {/* Timer / Status Text */}
                                <div className="text-white/70 text-base md:text-lg font-light min-h-[1.5rem] mb-4">
                                    {callStatus === 'connected' ? (
                                        <span className="font-mono text-green-400 font-medium tracking-wider">{formatTime(duration)}</span>
                                    ) : (
                                        <span className="animate-pulse">
                                            {callStatus === 'incoming' ? 'is calling you...' : 
                                             callStatus === 'calling' ? 'Waiting for answer...' : 
                                             'Connecting...'}
                                        </span>
                                    )}
                                </div>

                                {/* Avatar (Hidden if video enabled) */}
                                {(!remoteStream || callDetails.type !== 'video' || callStatus !== 'connected') && (
                                    <div className="mt-2 transform transition-transform duration-700 hover:scale-105">
                                        {renderAvatar('large')}
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons (Bottom) */}
                            <div className="flex items-center gap-8 md:gap-16">
                                {(callStatus === 'incoming') ? (
                                    <>
                                        <button 
                                            onClick={endCall}
                                            className="group flex flex-col items-center gap-2"
                                        >
                                            <div className="w-16 h-16 rounded-full bg-red-500/90 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all duration-300 transform group-hover:scale-110 group-active:scale-95">
                                                <span className="material-symbols-outlined text-3xl">call_end</span>
                                            </div>
                                            <span className="text-xs font-medium text-white/70">Decline</span>
                                        </button>
                                        <button 
                                            onClick={answerCall}
                                            className="group flex flex-col items-center gap-2"
                                        >
                                            <div className="w-16 h-16 rounded-full bg-green-500/90 hover:bg-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all duration-300 transform group-hover:scale-110 group-active:scale-95 animate-bounce-slight">
                                                <span className="material-symbols-outlined text-3xl">call</span>
                                            </div>
                                            <span className="text-xs font-medium text-white/70">Accept</span>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {/* In-Call Controls */}
                                        <button 
                                            onClick={handleToggleAudio}
                                            className={`w-14 h-14 rounded-full backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 ${isMicOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white text-slate-900'}`}
                                        >
                                            <span className="material-symbols-outlined text-2xl">{isMicOn ? 'mic' : 'mic_off'}</span>
                                        </button>

                                        <button 
                                            onClick={endCall}
                                            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-xl shadow-red-500/20 flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 mx-4"
                                        >
                                            <span className="material-symbols-outlined text-3xl">call_end</span>
                                        </button>

                                        {callDetails.type === 'video' && (
                                            <button 
                                                onClick={handleToggleVideo}
                                                className={`w-14 h-14 rounded-full backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 ${isVideoOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white text-slate-900'}`}
                                            >
                                                <span className="material-symbols-outlined text-2xl">{isVideoOn ? 'videocam' : 'videocam_off'}</span>
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Local Video Stream (Picture-in-Picture style for Desktop) */}
                    {callStatus === 'connected' && callDetails.type === 'video' && localStream && (
                        <div 
                            ref={localVideoContainerRef}
                            onMouseDown={handleLocalMouseDown}
                            style={{
                                transform: `translate(${localVideoPos.x}px, ${localVideoPos.y}px)`,
                                cursor: isDraggingLocal ? 'grabbing' : 'grab'
                            }}
                            className="absolute bottom-6 right-6 w-32 md:w-40 aspect-[3/4] bg-black/50 rounded-lg overflow-hidden shadow-2xl border border-white/20 z-30 transition-shadow hover:shadow-white/10 select-none"
                        >
                            <video 
                                playsInline 
                                autoPlay 
                                muted 
                                ref={localVideoRef}
                                className="w-full h-full object-cover transform scale-x-[-1]" // Mirror local video
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CallModal;

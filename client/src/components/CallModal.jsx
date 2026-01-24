import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import { useCall } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';

const Avatar = ({ src, size = "large", pulse = false }) => {
    return (
        <div className={`relative rounded-full overflow-hidden bg-gray-800 flex items-center justify-center shadow-2xl ${size === 'large' ? 'w-32 h-32 md:w-48 md:h-48' : 'w-12 h-12'}`}>
            {src ? (
                <img src={src} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
                <span className="material-symbols-outlined text-white/50 text-4xl">person</span>
            )}
            {pulse && (
                 <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping"></div>
            )}
        </div>
    );
};

const VideoFeed = ({ stream, isLocal = false, className, videoClassName = "", placeholderAvatar, showPlaceholderText = true, isMinimized = false, isVideoOn = true, connectionStatus = 'good' }) => {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(isLocal); // Local stream can be shown instantly

    useEffect(() => {
        if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const isReconnecting = connectionStatus === 'reconnecting';
    const showOverlay = !isPlaying || !isVideoOn || isReconnecting;

    return (
        <div className={`relative w-full h-full ${className}`}>
            <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted={true}
                onPlaying={() => setIsPlaying(true)}
                className={`w-full h-full object-cover transition-opacity duration-300 ${!showOverlay ? 'opacity-100' : 'opacity-0'} ${videoClassName}`}
                draggable="false"
            />
            {/* --- Placeholder when video is not playing OR turned off OR Reconnecting --- */}
            {showOverlay && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 overflow-hidden text-center p-4">
                    {/* Blurred Background */}
                    <div className="absolute inset-0 z-0">
                        {placeholderAvatar ? (
                            <img src={placeholderAvatar} alt="bg" className="w-full h-full object-cover blur-3xl opacity-40 scale-125" />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"></div>
                        )}
                        <div className="absolute inset-0 bg-black/40"></div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center">
                        <Avatar src={placeholderAvatar} size={isMinimized ? "small" : "large"} pulse={!isPlaying || isReconnecting} />
                        
                        {(showPlaceholderText && !isMinimized) && (
                            <div className="mt-8 flex flex-col items-center">
                                {isReconnecting ? (
                                    <>
                                        <span className="material-symbols-outlined text-yellow-500 text-3xl mb-2 animate-spin">sync</span>
                                        <p className="text-yellow-400 animate-pulse font-bold tracking-wide uppercase text-sm">Reconnecting...</p>
                                    </>
                                ) : !isVideoOn && isPlaying ? (
                                    <p className="text-white/60 font-medium tracking-wide uppercase text-xs">Camera is off</p>
                                ) : (
                                    <p className="text-white/60 animate-pulse font-medium tracking-wide uppercase text-xs">Connecting...</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const CallModal = () => {
    const { user } = useAuth();
    const { 
        callStatus, 
        localStream, 
        remoteStream, 
        callDetails, 
        answerCall, 
        endCall, 
        toggleAudio, 
        toggleVideo,
        switchCamera,
        remoteMediaStatus,
        currentFacingMode,
        hasMultipleCameras,
        connectionStatus
    } = useCall();
    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isLocalMainView, setIsLocalMainView] = useState(false);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef(null);
    const persistentRemoteAudioRef = useRef(null);
    const callAreaRef = useRef(null);

    // Initial config based on call type
    useEffect(() => {
        if (callDetails?.type === 'audio') {
            setIsVideoOn(false);
        } else {
            setIsVideoOn(true);
        }
        setIsMicOn(true); 
    }, [callDetails?.type]);

    // Timer
    useEffect(() => {
        let timer;
        if (callStatus === 'connected') {
            timer = setInterval(() => setDuration(p => p + 1), 1000);
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
        if (persistentRemoteAudioRef.current && remoteStream) {
            persistentRemoteAudioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    const handleToggleAudio = (e) => {
        e.stopPropagation();
        setIsMicOn(!isMicOn);
        toggleAudio(!isMicOn);
    };

    const handleToggleVideo = (e) => {
        e.stopPropagation();
        setIsVideoOn(!isVideoOn);
        toggleVideo(!isVideoOn);
    };

    const handleSwitchCamera = (e) => {
        if (e) e.stopPropagation();
        switchCamera();
    };

    const handleToggleSwap = (e) => {
        if (e) e.stopPropagation();
        if (isConnected) setIsLocalMainView(!isLocalMainView);
    };

    const handleEndCall = (e) => {
        e.stopPropagation();
        endCall();
    };

    const handleAnswerCall = (e) => {
        e.stopPropagation();
        answerCall();
    };

    // Auto-hide controls in full screen video
    const resetControlsTimeout = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        if (!isMinimized && callStatus === 'connected' && callDetails?.type === 'video') {
            controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
        }
    };

    useEffect(() => {
        if (!isMinimized) {
            window.addEventListener('mousemove', resetControlsTimeout);
            window.addEventListener('touchstart', resetControlsTimeout);
            resetControlsTimeout(); 
        } else {
             setShowControls(true);
        }
        return () => {
            window.removeEventListener('mousemove', resetControlsTimeout);
            window.removeEventListener('touchstart', resetControlsTimeout);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        };
    }, [isMinimized, callStatus, callDetails]);

    // Reset playing state when status changes

    // Reset playing state when status changes

    // Reset playing state when status changes
    useEffect(() => {
        if (callStatus === 'ended' || callStatus === 'idle') {
            // Cleanup sounds if needed
        }
    }, [callStatus]);

    const shouldRender = (callStatus !== 'idle' && callDetails);
    const safeCallDetails = callDetails || {};
    const isVideoCall = safeCallDetails.type === 'video';
    const isIncoming = callStatus === 'incoming';
    const isOutgoing = callStatus === 'calling';
    const isConnected = callStatus === 'connected';

    // Ref for constraints

    return (
        <AnimatePresence>
             {shouldRender && (
                <motion.div
                    key="modal-container"
                    ref={callAreaRef}
                    drag={isMinimized}
                    dragMomentum={false}
                    initial={{ opacity: 0 }}
                    animate={isMinimized 
                        ? { opacity: 1, width: 320, height: isVideoCall ? 180 : 80, x: window.innerWidth - 340, y: window.innerHeight - 200, borderRadius: 12 } 
                        : { opacity: 1, width: "100%", height: "100%", x: 0, y: 0, borderRadius: 0 }
                    }
                    exit={{ opacity: 0, scale: 0.95, pointerEvents: "none" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={`fixed z-[9999] overflow-hidden shadow-2xl ${isMinimized ? 'touch-none' : 'inset-0 bg-black text-white'}`}
                    style={isMinimized ? {} : { top: 0, left: 0 }}
                >
                    {/* Persistent Hidden Remote Audio - Centralizing for sync */}
                    <audio ref={persistentRemoteAudioRef} autoPlay playsInline className="hidden" />

                    {/* --- Stable Background for Video Calls --- */}
                    {(isConnected || (isOutgoing && isVideoCall)) && isVideoCall && (
                        <div className="absolute inset-0 bg-black z-0">
                            <VideoFeed 
                                stream={isConnected 
                                    ? (isLocalMainView ? localStream : remoteStream) 
                                    : localStream
                                } 
                                isLocal={isConnected ? isLocalMainView : true}
                                placeholderAvatar={isLocalMainView 
                                    ? (user?.avatar_url || user?.avatar_thumb_url)
                                    : safeCallDetails.callerAvatar
                                }
                                isMinimized={isMinimized}
                                isVideoOn={isConnected 
                                    ? (isLocalMainView ? isVideoOn : remoteMediaStatus.video) 
                                    : isVideoOn
                                }
                                connectionStatus={isConnected ? (isLocalMainView ? 'good' : connectionStatus) : 'good'}
                                className="w-full h-full"
                                videoClassName={(isOutgoing || (isConnected && isLocalMainView)) && currentFacingMode === 'user' ? "transform scale-x-[-1]" : ""}
                                showPlaceholderText={!isLocalMainView}
                            />
                        </div>
                    )}

                    {isMinimized ? (
                        /* --- Minimized View Overlay --- */
                        <div className="w-full h-full relative group z-10">
                             {isVideoCall ? (
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                      <button onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center backdrop-blur">
                                          <span className="material-symbols-outlined text-lg">fullscreen</span>
                                      </button>
                                  </div>
                             ) : (
                                  <div className="w-full h-full bg-slate-800 flex items-center p-3 gap-3 border-l-4 border-green-500">
                                       <Avatar src={safeCallDetails.callerAvatar} size="small" />
                                       <div className="flex-1 min-w-0">
                                           <h4 className="font-bold text-white text-sm truncate">{renderTextWithEmojis(safeCallDetails.callerName, "1.1em")}</h4>
                                           <span className="text-xs text-green-400 font-mono">{formatTime(duration)}</span>
                                       </div>
                                       <div className="flex flex-col gap-1">
                                           <button onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }} className="text-white/60 hover:text-white">
                                                <span className="material-symbols-outlined text-lg">fullscreen</span>
                                           </button>
                                       </div>
                                  </div>
                             )}
                             <div className="absolute top-1 right-1">
                                 <button onClick={handleEndCall} className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md">
                                    <span className="material-symbols-outlined text-xs">close</span>
                                 </button>
                             </div>
                        </div>
                    ) : (
                        /* --- Full Screen Views --- */
                        <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden z-10">
                            {isIncoming ? (
                                /* --- Incoming Screen --- */
                                <motion.div 
                                    key="incoming"
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="w-full h-full flex flex-col items-center justify-between p-8 md:p-12"
                                >
                                    <div className="absolute inset-0 z-0">
                                         {safeCallDetails.callerAvatar ? (
                                             <img src={safeCallDetails.callerAvatar} alt="bg" className="w-full h-full object-cover blur-3xl opacity-30 scale-110" />
                                         ) : (
                                             <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"></div>
                                         )}
                                         <div className="absolute inset-0 bg-black/40"></div>
                                    </div>
                                    <div className="relative z-10 flex flex-col items-center mt-10">
                                        <div className="flex items-center gap-2 mb-4 px-4 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/5">
                                            <span className={`material-symbols-outlined text-sm ${isVideoCall ? 'text-blue-400' : 'text-green-400'}`}>
                                                {isVideoCall ? 'videocam' : 'call'}
                                            </span>
                                            <span className="text-xs font-medium tracking-wide uppercase opacity-80">
                                                Incoming {isVideoCall ? 'Video' : 'Audio'} Call
                                            </span>
                                        </div>
                                        <Avatar src={safeCallDetails.callerAvatar} size="large" pulse={true} />
                                        <h2 className="text-3xl md:text-4xl font-bold mt-6 text-center text-shadow-sm">
                                            {renderTextWithEmojis(safeCallDetails.callerName || "Unknown", "1.1em")}
                                        </h2>
                                        <p className="text-white/60 mt-2 text-lg">is calling you...</p>
                                    </div>
                                    <div className="relative z-10 w-full max-w-md flex items-center justify-around mb-8">
                                         <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={handleEndCall}>
                                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/20">
                                                 <span className="material-symbols-outlined text-3xl">call_end</span>
                                            </motion.button>
                                            <span className="text-sm font-medium opacity-80 group-hover:opacity-100">Decline</span>
                                         </div>
                                         <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={handleAnswerCall}>
                                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg shadow-green-500/20 animate-bounce-slight">
                                                 <span className="material-symbols-outlined text-3xl">call</span>
                                            </motion.button>
                                              <span className="text-sm font-medium opacity-80 group-hover:opacity-100">Accept</span>
                                         </div>
                                    </div>
                                </motion.div>
                            ) : isOutgoing ? (
                                /* --- Outgoing Screen --- */
                                <motion.div 
                                    key="outgoing"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="w-full h-full flex flex-col items-center justify-between p-8 md:p-12"
                                >
                                    {!isVideoCall && (
                                        <div className="absolute inset-0 z-0">
                                            {safeCallDetails.callerAvatar ? (
                                                <img src={safeCallDetails.callerAvatar} alt="bg" className="w-full h-full object-cover blur-3xl opacity-30 scale-110" />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"></div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40"></div>
                                        </div>
                                    )}
                                    <div className="relative z-10 flex flex-col items-center mt-10">
                                        <div className="flex items-center gap-2 mb-4 px-4 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/5">
                                            <span className="text-xs font-medium tracking-wide uppercase opacity-80">
                                                Calling...
                                            </span>
                                        </div>
                                        <Avatar src={safeCallDetails.callerAvatar} size="large" pulse={!isVideoCall} />
                                        <h2 className="text-3xl md:text-4xl font-bold mt-6 text-center text-shadow-sm">
                                            {renderTextWithEmojis(safeCallDetails.callerName, "1.1em")}
                                        </h2>
                                        <p className="text-white/60 mt-2 text-lg">Waiting for answer...</p>
                                    </div>
                                    <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-8 mb-8">
                                        <div className="flex items-center gap-6">
                                            <motion.button onClick={handleToggleAudio} whileTap={{ scale: 0.95 }} className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 ${isMicOn ? 'bg-white/10 text-white' : 'bg-white text-black'}`}>
                                                <span className="material-symbols-outlined">{isMicOn ? 'mic' : 'mic_off'}</span>
                                            </motion.button>
                                            <motion.button onClick={handleEndCall} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="w-16 h-16 rounded-full bg-red-500 text-white shadow-xl shadow-red-500/20 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-3xl">call_end</span>
                                            </motion.button>
                                            {isVideoCall && (
                                                <div className="flex gap-4">
                                                    {hasMultipleCameras && (
                                                        <motion.button onClick={handleSwitchCamera} whileTap={{ scale: 0.95 }} className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 bg-white/10 text-white">
                                                            <span className="material-symbols-outlined">flip_camera_ios</span>
                                                        </motion.button>
                                                    )}
                                                    <motion.button onClick={handleToggleVideo} whileTap={{ scale: 0.95 }} className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 ${isVideoOn ? 'bg-white/10 text-white' : 'bg-white text-black'}`}>
                                                        <span className="material-symbols-outlined">{isVideoOn ? 'videocam' : 'videocam_off'}</span>
                                                    </motion.button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ) : isVideoCall ? (
                                /* --- Active Video Overlays --- */
                                <div className="w-full h-full relative pointer-events-none">
                                    <AnimatePresence>
                                        {showControls && (
                                            <>
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start bg-gradient-to-b from-black/70 to-transparent z-20 pointer-events-auto">
                                                    <button onClick={() => setIsMinimized(true)} className="w-10 h-10 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-md transition-colors shrink-0">
                                                        <span className="material-symbols-outlined">expand_more</span>
                                                    </button>
                                                    <div className="flex flex-col items-end">
                                                        <h3 className="text-white font-bold drop-shadow-md">{renderTextWithEmojis(safeCallDetails.callerName, "1.2em")}</h3>
                                                        <p className="text-white/80 text-sm font-mono drop-shadow-md">{formatTime(duration)}</p>
                                                    </div>
                                                </motion.div>
                                                <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="absolute bottom-0 left-0 right-0 p-8 pb-12 flex justify-center items-center gap-4 md:gap-6 bg-gradient-to-t from-black/80 to-transparent z-20 pointer-events-auto">
                                                     <motion.button onClick={handleToggleAudio} whileTap={{ scale: 0.95 }} className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 shadow-lg transition-all ${isMicOn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white text-black'}`}>
                                                        <span className="material-symbols-outlined">{isMicOn ? 'mic' : 'mic_off'}</span>
                                                    </motion.button>
                                                    
                                                    {isVideoOn && hasMultipleCameras && (
                                                        <motion.button onClick={handleSwitchCamera} whileTap={{ scale: 0.95 }} className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 shadow-lg bg-white/20 text-white hover:bg-white/30 transition-all">
                                                            <span className="material-symbols-outlined">flip_camera_ios</span>
                                                        </motion.button>
                                                    )}

                                                    <motion.button onClick={handleEndCall} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="w-16 h-16 rounded-full bg-red-600 text-white shadow-xl shadow-red-600/30 flex items-center justify-center mx-1 md:mx-2">
                                                        <span className="material-symbols-outlined text-3xl">call_end</span>
                                                    </motion.button>
                                                    
                                                    <motion.button onClick={handleToggleVideo} whileTap={{ scale: 0.95 }} className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 shadow-lg transition-all ${isVideoOn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white text-black'}`}>
                                                        <span className="material-symbols-outlined">{isVideoOn ? 'videocam' : 'videocam_off'}</span>
                                                    </motion.button>
                                                </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>

                                    {(isConnected && localStream) && (
                                        <motion.div 
                                            drag 
                                            dragConstraints={callAreaRef} 
                                            dragMomentum={false} 
                                            whileDrag={{ scale: 1.05, cursor: "grabbing" }} 
                                            className="absolute z-30 w-28 md:w-36 aspect-[3/4] bg-zinc-900 rounded-xl overflow-hidden shadow-2xl border border-white/20 pointer-events-auto" 
                                            style={{ bottom: 24, right: 24 }}
                                        >
                                            <VideoFeed 
                                                stream={isLocalMainView ? remoteStream : localStream} 
                                                isLocal={!isLocalMainView} 
                                                isVideoOn={isLocalMainView ? remoteMediaStatus.video : isVideoOn}
                                                placeholderAvatar={isLocalMainView 
                                                    ? safeCallDetails.callerAvatar
                                                    : (user?.avatar_url || user?.avatar_thumb_url)
                                                }
                                                showPlaceholderText={false}
                                                isMinimized={true}
                                                connectionStatus={isLocalMainView ? connectionStatus : 'good'}
                                                videoClassName={!isLocalMainView && currentFacingMode === 'user' ? "transform scale-x-[-1]" : ""} 
                                            />
                                            
                                            {/* Dedicated Circular Swap Button */}
                                            <div className="absolute top-2 left-2 z-40">
                                                <button 
                                                    onClick={handleToggleSwap}
                                                    className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md flex items-center justify-center transition-all border border-white/10 shadow-lg active:scale-95"
                                                    title="Swap View"
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            ) : (
                                /* --- Active Audio Screen --- */
                                <div key="active-audio" className="w-full h-full flex flex-col relative bg-slate-900 overflow-hidden">
                                     <div className="absolute inset-0 z-0">
                                        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-violet-600/20 rounded-full blur-[120px] animate-pulse-slow"></div>
                                        <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-fuchsia-600/20 rounded-full blur-[120px] animate-pulse-slow delay-1000"></div>
                                        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/60"></div>
                                     </div>
                                     <div className="relative z-10 w-full p-6 flex justify-between items-start">
                                        <button onClick={() => setIsMinimized(true)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
                                             <span className="material-symbols-outlined text-3xl">expand_more</span>
                                        </button>
                                        <div className="flex flex-col items-center">
                                             <h3 className="text-2xl font-bold tracking-tight mb-1">
                                                 {renderTextWithEmojis(safeCallDetails.callerName, "1em")}
                                             </h3>
                                             <p className="font-mono text-green-400 tracking-wider bg-green-500/10 px-3 py-0.5 rounded-full text-sm">
                                                 {formatTime(duration)}
                                             </p>
                                        </div>
                                        <div className="w-10"></div>
                                     </div>
                                     <div className="relative z-10 flex-1 flex items-center justify-center">
                                         <div className="relative">
                                             <div className="absolute inset-0 rounded-full border border-white/10 animate-[ping_4s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                                             <div className="absolute inset-[-12px] rounded-full border border-white/5 animate-[ping_4s_cubic-bezier(0,0,0.2,1)_infinite] delay-75"></div>
                                             <Avatar src={safeCallDetails.callerAvatar} size="large" />
                                         </div>
                                     </div>
                                     <div className="relative z-10 pb-12 pt-4 px-4 flex justify-center items-center gap-6 md:gap-8">
                                         <motion.button whileTap={{ scale: 0.9 }} onClick={handleToggleAudio} className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${isMicOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-slate-900'}`}>
                                             <span className="material-symbols-outlined text-2xl">{isMicOn ? 'mic' : 'mic_off'}</span>
                                         </motion.button>
                                         <motion.button whileHover={{ scale: 1.1, rotate: 135 }} whileTap={{ scale: 0.9 }} onClick={handleEndCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 shadow-xl shadow-red-500/30 text-white flex items-center justify-center">
                                             <span className="material-symbols-outlined text-3xl">call_end</span>
                                         </motion.button>
                                         <div className="w-14 h-14"></div> 
                                     </div>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
             )}
        </AnimatePresence>
    );
};

export default CallModal;

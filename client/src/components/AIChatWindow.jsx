import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { linkifyText } from '../utils/linkify';
import SparkleLogo from './icons/SparkleLogo';
import { useAiChat } from '../context/AiChatContext';
import { useConfirm } from '../context/ConfirmationContext';

// [NEW] Welcome Component
function WelcomeView({ onPromptClick }) {
    const suggested = [
        "Tell me a fun fact about space",
        "How do I cook pasta?",
        "Write a poem about coding",
        "Explain quantum physics simply"
    ];

    return (
        <div className="flex-1 flex flex-col items-center justify-start p-8 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto min-h-0 w-full">
            <div className="my-auto flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-fuchsia-100 to-purple-100 dark:from-fuchsia-900/20 dark:to-purple-900/20 flex items-center justify-center mb-6 shadow-xl shadow-fuchsia-500/10 shrink-0">
                    <SparkleLogo className="w-12 h-12" />
                </div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 mb-3 text-center shrink-0">
                    Welcome to Sparkle AI
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-center max-w-md mb-8 leading-relaxed shrink-0">
                    I'm your personal AI assistant. Ask me anything, or pick a suggestion below to get started!
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg shrink-0">
                    {suggested.map((text, i) => (
                        <button
                            key={i}
                            onClick={() => onPromptClick(text)}
                            className="p-4 text-sm text-left bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20 hover:border-fuchsia-200 dark:hover:border-fuchsia-700/50 transition-all duration-200 shadow-sm hover:shadow-md group"
                        >
                            <span className="text-slate-700 dark:text-slate-200 group-hover:text-fuchsia-700 dark:group-hover:text-fuchsia-300 font-medium">{text}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// [NEW] Setup Prompt Component
function SetupPrompt({ onStart, onCloudStart, onBack, initialStep = 'choice' }) {
    const [step, setStep] = useState(initialStep); // 'choice' or 'local-details'

    if (step === 'local-details') {
        return (
            <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950 items-center justify-center p-8 text-center animate-in slide-in-from-right duration-500">
                <div className="w-24 h-24 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/20 flex items-center justify-center mb-6 shadow-xl shadow-fuchsia-500/10">
                    <SparkleLogo className="w-12 h-12 text-fuchsia-500" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Local AI Setup</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
                    To run privately on your device, I need to download my "brain" (the AI model). 
                    This is a one-time download of about <strong className="text-slate-900 dark:text-white">400MB</strong>.
                </p>
                
                <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 text-[13px] text-amber-800 dark:text-amber-200 mb-3 max-w-sm text-left shadow-sm">
                    <div className="flex items-center gap-2 mb-2 font-bold uppercase text-[9px] tracking-widest text-amber-600 opacity-80">
                        <span className="material-symbols-outlined text-[16px]">storage</span>
                        Storage Information
                    </div>
                    <p className="mb-1.5 leading-snug">
                        AI models are stored in the <strong>Internal Cache</strong> (usually on your <strong>C: Drive</strong>).
                    </p>
                    <p className="text-[11px] opacity-70 leading-normal italic">
                        Browsers don't allow picking drives directly. If C: is full, move the browser's profile in Windows.
                    </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-200 dark:border-blue-800/50 text-[11px] text-blue-800 dark:text-blue-200 mb-6 max-w-sm flex gap-2.5 text-left shadow-sm">
                    <span className="material-symbols-outlined text-[16px] text-blue-500 shrink-0">info</span>
                    <p className="leading-normal">
                        <strong>Note:</strong> This search only finds files in the <strong>same browser</strong>. Chrome cannot see files from Edge or Firefox.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs transition-all">
                    <button 
                        onClick={onStart}
                        className="flex-1 py-3 px-6 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl font-bold shadow-lg shadow-fuchsia-500/20 transition-all active:scale-95"
                    >
                        Download AI
                    </button>
                    <button 
                        onClick={() => setStep('choice')}
                        className="flex-1 py-3 px-6 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-all hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-95"
                    >
                        Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950 items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="w-24 h-24 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/20 flex items-center justify-center mb-6 shadow-xl shadow-fuchsia-500/10">
                <SparkleLogo className="w-12 h-12 text-fuchsia-500" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Enable Sparkle AI</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
                Choose how you want to interact with Sparkle AI. You can run it <strong className="text-slate-900 dark:text-white">instantly via the cloud</strong> or download it to run <strong className="text-slate-900 dark:text-white">privately on your device</strong>.
            </p>
            
            <div className="grid grid-cols-1 gap-4 w-full max-w-lg mb-8">
                {/* Groq Cloud Option */}
                <button 
                    onClick={onCloudStart}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-left hover:border-sky-500 dark:hover:border-sky-500 hover:shadow-lg hover:shadow-sky-500/5 transition-all group"
                >
                    <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center text-sky-500 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-2xl">bolt</span>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-slate-900 dark:text-white">Instant Cloud AI</span>
                            <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 text-[9px] font-black uppercase rounded-md">Recommended</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Ultra-fast, smart, and requires no download. Powered by Groq Cloud.</p>
                    </div>
                </button>

                {/* Local WASM Option */}
                <button 
                    onClick={() => setStep('local-details')}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-left hover:border-fuchsia-500 dark:hover:border-fuchsia-500 hover:shadow-lg hover:shadow-fuchsia-500/5 transition-all group"
                >
                    <div className="w-12 h-12 rounded-xl bg-fuchsia-50 dark:bg-fuchsia-900/20 flex items-center justify-center text-fuchsia-500 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-2xl">terminal</span>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-slate-900 dark:text-white">Private Local AI</span>
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-bold rounded-md">400MB</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Total privacy. Runs entirely on your hardware. Works offline.</p>
                    </div>
                </button>
            </div>

            <div className="bg-slate-100/50 dark:bg-slate-900/50 px-4 py-3 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto flex items-center gap-3">
                <span className="material-symbols-outlined text-sm opacity-60">info</span>
                <p className="leading-tight text-left">You can switch between modes anytime from the chat header settings.</p>
            </div>

            <button 
                onClick={onBack}
                className="mt-8 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-widest"
            >
                Not Now
            </button>
        </div>
    );
}

export default function AIChatWindow({ socket, room, user, onBack, isLoading }) {
    const { token } = useAuth();
    const confirm = useConfirm();
    
    const { 
        getChatState, registerRoom, sendQuery, cancelAi, clearAiChat, regenerate, 
        setMessages: setContextMessages, deleteMessageLocal, syncMessages, 
        initEngine, isModelLoading, modelProgress, isDownloading, isSetupComplete, 
        setIsSetupComplete, isLocalModelSetupComplete, setIsLocalModelSetupComplete, 
        isPaused, cancelDownload, pauseDownload, resetAi,
        aiProvider, setAiProvider 
    } = useAiChat();
    
    // AI Chat State
    const [aiName, setAiName] = useState('Sparkle AI');
    const [showMenu, setShowMenu] = useState(false);
    
    // Derived state from context
    const { messages, isAiThinking, currentAiOp, insertIndex } = getChatState(room.id);

    // [NEW] Automatic initialization ONLY if setup is already complete and provider is local
    useEffect(() => {
        if (isSetupComplete && aiProvider === 'local') {
            initEngine();
        }
    }, [initEngine, isSetupComplete, aiProvider]);

    // We don't need typing users or privileged modals for AI chat
    const [replyTo, setReplyTo] = useState(null);
    const justClearedRef = useRef(false);

    // Initial Load & Normalization
    useEffect(() => {
        // [FIX] Always sync from server first to get canonical data
        // This prevents duplicates from stale localStorage or initialMessages
        syncMessages(room.id);
        
        if (socket) {
            socket.emit('join_room', room.id);
        }

        // Only register room structure if it doesn't exist (for thinking state etc)
        const normalized = (room.initialMessages || []).map(m => {
             // Check if it's an AI message
             const isAi = m.author_name === 'Assistant' || (m.meta && m.meta.ai);
             if (isAi) {
                 return {
                     ...m,
                     user_id: 'ai-assistant', 
                     display_name: aiName,    
                     avatar_thumb_url: null   
                 };
             }
             return m;
        });
        
        // Register room structure only (messages will come from syncMessages)
        registerRoom(room.id, []);
        
    }, [room.id, aiName, registerRoom, syncMessages]);


    // [NEW] Show Setup Prompt for first-time users OR if Local is not yet setup
    const showLocalDetails = aiProvider === 'local' && !isLocalModelSetupComplete;
    const showSetup = !isSetupComplete || showLocalDetails;

    if (showSetup) {
        return (
            <SetupPrompt 
                initialStep={showLocalDetails ? 'local-details' : 'choice'}
                onStart={() => {
                    setIsLocalModelSetupComplete(true);
                    initEngine();
                }} 
                onCloudStart={() => {
                    setAiProvider('groq');
                    setIsSetupComplete(true);
                }}
                onBack={onBack} 
            />
        );
    }

    // [NEW] Paused State UI
    if (isPaused) {
        return (
            <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950 items-center justify-center p-8 text-center animate-in fade-in duration-500">
                <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-4xl text-amber-500">pause_circle</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Setup Paused</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-xs mb-8">
                    Your progress has been saved. You can resume at any time.
                </p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button 
                        onClick={initEngine}
                        className="py-3 px-6 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">play_arrow</span>
                        Resume Setup
                    </button>
                    <button 
                        onClick={() => {
                            cancelDownload(); // Clears state
                            onBack();
                        }}
                        className="py-3 px-6 text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-white transition-colors"
                    >
                        Quit Setup
                    </button>
                </div>
            </div>
        );
    }

    // [NEW] Download Progress UI - ONLY for Local AI
    if (aiProvider === 'local' && (isModelLoading || (modelProgress?.status === 'error'))) {
        return (
            <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950 items-center justify-center p-8 text-center space-y-6 animate-in fade-in duration-300">
                <div className="w-24 h-24 relative flex items-center justify-center">
                    {modelProgress?.status === 'error' ? (
                        <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-4xl text-red-500">error</span>
                        </div>
                    ) : (
                        <>
                            <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-800"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-fuchsia-500 border-t-transparent animate-spin"></div>
                            <SparkleLogo className="w-10 h-10 text-fuchsia-500 animate-pulse" />
                        </>
                    )}
                </div>
                
                <div className="space-y-3 max-w-md">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {modelProgress?.status === 'error' ? 'Setup Failed' : (
                            modelProgress?.status === 'searching' ? 'Searching for AI' : (
                                isDownloading ? 'Downloading AI' : 'Initializing AI'
                            )
                        )}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400">
                        {modelProgress?.status === 'error' 
                            ? "An error occurred while loading the AI model into memory. This can happen if your GPU memory is full or the connection was interrupted."
                            : (
                                modelProgress?.status === 'searching'
                                ? "Checking if you already have the Sparkle AI core on this device..."
                                : (
                                    isDownloading 
                                        ? (
                                            <>
                                                Downloading the model to your device to run privately. This happens only once.
                                                <br/><span className="text-xs opacity-75">(Approx 400MB)</span>
                                            </>
                                        )
                                        : "Optimizing AI for your device. This will only take a moment..."
                                )
                            )
                        }
                    </p>
                    
                    {/* [REFINE] Only show technical progress box during actual download or initial search */}
                    {modelProgress && modelProgress.status !== 'error' && (isDownloading || modelProgress.status === 'searching') && (
                        <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800 shadow-sm w-full">
                            <div className="flex justify-between text-xs font-mono mb-2 text-slate-500 dark:text-slate-400">
                                <span className="truncate max-w-[200px]">{modelProgress.file}</span>
                                <span>{modelProgress.status === 'searching' ? 'Checking...' : `${Math.round(modelProgress.progress || 0)}%`}</span>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full bg-fuchsia-500 transition-all duration-300 ${modelProgress.status === 'searching' ? 'animate-pulse w-full' : ''}`}
                                    style={modelProgress.status === 'searching' ? {} : { width: `${modelProgress.progress || 0}%` }}
                                ></div>
                            </div>
                            <div className="mt-2 text-xs text-slate-400 text-left capitalize">
                                {modelProgress.status}
                            </div>
                        </div>
                    )}

                    {(!modelProgress || modelProgress.progress === 100) && (modelProgress?.status !== 'error') && (
                        <div className="flex items-center gap-2 justify-center py-4">
                             <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-bounce [animation-delay:-0.3s]"></span>
                             <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-bounce [animation-delay:-0.15s]"></span>
                             <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-bounce"></span>
                        </div>
                    )}

                    {modelProgress?.status === 'error' && (
                        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 text-left">
                            <div className="flex gap-2 mb-2">
                                <span className="material-symbols-outlined text-[18px]">warning</span>
                                <strong>Technical Error:</strong>
                            </div>
                            <code className="block bg-black/5 dark:bg-white/5 p-2 rounded text-[11px] font-mono break-all mb-4">
                                {modelProgress.error}
                            </code>
                            <button
                                onClick={resetAi}
                                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[18px]">refresh</span>
                                Reset & Try Again
                            </button>
                        </div>
                    )}

                    {/* [NEW] Control Buttons - Only show during actual download */}
                    {modelProgress && modelProgress.status !== 'error' && modelProgress.status !== 'searching' && isDownloading && (
                        <div className="flex gap-3 w-full max-w-xs mt-4">
                            <button 
                                onClick={pauseDownload}
                                className="flex-1 py-2 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">pause</span>
                                Pause
                            </button>
                            <button 
                                onClick={cancelDownload}
                                className="flex-1 py-2 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600 hover:border-red-200 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }



    const handleSend = (content, replyToMsg) => {
        setReplyTo(null);
        sendQuery(room.id, content, replyToMsg);
    };

    const handleCancelAi = () => {
        cancelAi(room.id);
    };

    const handleClearChat = async () => {
        const confirmed = await confirm({
            title: 'Clear AI Chat',
            message: 'Clear all messages in this AI chat?',
            type: 'danger',
            confirmText: 'Clear'
        });
        if (!confirmed) return;
        try {
             justClearedRef.current = true;
             // Clear local state immediately
             clearAiChat(room.id);
             
             // Clear on server
             await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages`, {
                 method: 'DELETE',
                 headers: { Authorization: `Bearer ${token}` }
             });
             
             // [FIX] Emit socket event locally to trigger sidebar update
             // The server should also emit this, but we do it here for immediate feedback
             if (socket) {
                 socket.emit('chat:cleared', { roomId: room.id });
             }
        } catch (e) {
            console.error(e);
            justClearedRef.current = false;
        }
    };


    const handleLocalDelete = (messageId) => {
        deleteMessageLocal(room.id, messageId);
    };

    const handleRegenerate = async (aiMessageId) => {
        const aiMsgIndex = messages.findIndex(m => m.id === aiMessageId);
        if (aiMsgIndex === -1) return;
        
        // Find preceding user message
        let prompt = null;
        for (let i = aiMsgIndex - 1; i >= 0; i--) {
            if (messages[i].user_id === user.id) {
                prompt = messages[i].content;
                break;
            }
        }
        
        if (!prompt) return; 

        // Remove the old AI message
        handleLocalDelete(aiMessageId);
        
        // Trigger AI via context
        // We just sendQuery again with the same prompt? 
        // Or we might need a specific regenerate logic if we want to avoid double user msg
        // Actually sendQuery adds a user message. We don't want that for regenerate usually?
        // Wait, sendQuery adds a temp user message. 
        // If we want to regenerate, we probably just want to call the API without adding a user message.
        // But `sendQuery` does both.
        // Let's create a specialized regenerate in context? Or simply mock it here?
        // Since we are moving logic to context, let's keep it simple:
        // Ideally we should have a `regenerate` action in context.
        // For now, let's invoke the API directly here but use context setters?
        // Or better, add `regenerateQuery` to context? 
        // Let's stick to local logic for regeneration using `sendQuery` but avoiding the user msg?
        regenerate(room.id, prompt, aiMsgIndex, aiMessageId);
    };

    // Helper to construct messages with skeleton/partial
    // derived messages already has state, but we need to append currentAiOp if streaming
    
    const displayedMessages = [...messages];
    let streamingMsg = null;

    if (currentAiOp && currentAiOp.content) {
        streamingMsg = {
            id: 'streaming-ai',
            room_id: room.id,
            user_id: 'ai-assistant', 
            display_name: aiName,
            username: 'Assistant',
            content: currentAiOp.content,
            created_at: new Date().toISOString(),
            type: 'text',
            avatar_thumb_url: null, 
            isStreaming: currentAiOp.isStreaming !== false 
        };
    } else if (isAiThinking || (currentAiOp && !currentAiOp.content)) {
        streamingMsg = {
            id: 'thinking-ai',
            room_id: room.id,
            user_id: 'ai-assistant', 
            display_name: aiName,
            username: 'Assistant',
            content: '', 
            created_at: new Date().toISOString(),
            type: 'text',
            avatar_thumb_url: null, 
            isSkeleton: true
        };
    }

    if (streamingMsg) {
        if (insertIndex !== undefined && insertIndex > -1) {
            displayedMessages.splice(insertIndex, 0, streamingMsg);
        } else {
            displayedMessages.push(streamingMsg);
        }
    }

    // Valid wrapper for MessageList to update context messages (optimistic updates)
    const handleSetMessages = (action) => {
        let newResult;
        if (typeof action === 'function') {
            newResult = action(displayedMessages);
        } else {
            newResult = action;
        }
        
        // Filter out ephemeral AI messages before saving to context
        const cleanMessages = newResult.filter(m => m.id !== 'streaming-ai' && m.id !== 'thinking-ai');
        setContextMessages(room.id, cleanMessages);
    };
    
    // [NEW] Check for empty state for Welcome View
    const isEmpty = displayedMessages.length === 0 && !isLoading && !isAiThinking && !currentAiOp;


    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950 relative overflow-hidden transition-colors animate-in fade-in zoom-in-95 duration-500">
            {/* Distinct Background for AI */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-fuchsia-100/40 via-slate-50 to-slate-50 dark:from-fuchsia-900/10 dark:via-slate-950 dark:to-slate-950 pointer-events-none transition-colors" />

            {/* AI Header */}
             <div className="p-4 border-b border-fuchsia-100 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md flex items-center gap-4 shadow-sm z-10 transition-colors shrink-0">
                <button 
                    onClick={onBack}
                    className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>

                <div className="flex-1 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-fuchsia-50 dark:bg-fuchsia-900/10 border border-fuchsia-100 dark:border-fuchsia-800/30 shadow-lg shadow-fuchsia-500/10">
                        <SparkleLogo className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            {aiName}
                            <span className="px-2 py-0.5 rounded-full bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-300 text-[10px] font-bold uppercase tracking-wider border border-fuchsia-200 dark:border-fuchsia-500/30">
                                Beta
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Always here to help
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 relative">
                    {/* [NEW] Provider Switcher */}
                    <div className="hidden sm:flex bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-full mr-1 border border-slate-200/50 dark:border-slate-700/50 shadow-inner backdrop-blur-sm">
                        <button
                            onClick={() => setAiProvider('local')}
                            title="Use Local AI (Private & Offline)"
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all duration-300 ${
                                aiProvider === 'local' 
                                ? 'bg-white dark:bg-slate-700 shadow-md text-fuchsia-600 dark:text-fuchsia-400 scale-105' 
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">memory</span>
                            Local
                        </button>
                        <button
                            onClick={() => setAiProvider('groq')}
                            title="Use Groq Cloud (Ultra-Fast & Smart)"
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all duration-300 ${
                                aiProvider === 'groq' 
                                ? 'bg-white dark:bg-slate-700 shadow-md text-sky-600 dark:text-sky-400 scale-105' 
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">cloud</span>
                            Cloud
                        </button>
                    </div>

                    <button 
                         onClick={() => setShowMenu(!showMenu)}
                         className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 border shadow-sm shrink-0 ${
                            showMenu 
                            ? 'bg-fuchsia-50 dark:bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-500/50'
                            : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-white border-slate-200 dark:border-slate-700'
                         }`}
                    >
                         <span className={`material-symbols-outlined transition-transform duration-300 ${showMenu ? 'rotate-90' : ''}`}>settings</span>
                    </button>

                    {showMenu && (
                        <>
                            <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setShowMenu(false)}
                            />
                            <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                <button 
                                    onClick={() => {
                                        handleClearChat();
                                        setShowMenu(false);
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                                >
                                     <span className="material-symbols-outlined text-[18px]">delete</span>
                                     Clear History
                                 </button>

                                 <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                                 <div className="px-3 py-2">
                                     <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                                         Sparkle AI v1.0
                                     </p>
                                     <p className="text-[9px] text-slate-400 dark:text-slate-500 px-1 leading-relaxed italic">
                                         "Your local assistant, powered by the cloud."
                                     </p>
                                 </div>
                             </div>
                         </>
                    )}
                </div>
            </div>

            {/* Messages */}
            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 z-10">
                     <span className="material-symbols-outlined text-4xl animate-spin text-fuchsia-500">smart_toy</span>
                     <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse">Initializing AI...</p>
                </div>
            ) : isEmpty ? (
                <WelcomeView onPromptClick={handleSend} />
            ) : (
                <MessageList 
                    messages={displayedMessages} 
                    setMessages={handleSetMessages} 
                    currentUser={user} 
                    roomId={room.id} 
                    socket={socket} 
                    onReply={setReplyTo} 
                    onDelete={handleLocalDelete}
                    // AI probably doesn't support editing messages or retrying uploads yet, but we can pass no-ops or nulls
                    onRetry={() => {}} 
                    onEdit={() => {}}
                    onRegenerate={handleRegenerate}
                />
            )}

            {/* Input - Reusing MessageInput but simplified for AI if needed */}
            <div className="shrink-0 z-20">
                <MessageInput 
                    onSend={(content) => handleSend(content, replyTo)} 
                    onSendAudio={() => alert("Voice for AI coming soon!")} 
                    onSendGif={() => alert("GIFs for AI coming soon!")}
                    disabled={isAiThinking || (!!currentAiOp && currentAiOp.isStreaming !== false)} // Still disabled for text input, but we'll use isGenerating for button
                    isGenerating={!!currentAiOp && currentAiOp.isStreaming !== false} // [NEW] Flag for checking if generating
                    onStop={handleCancelAi}       // [NEW] Stop handler
                    replyTo={replyTo}          
                    setReplyTo={setReplyTo}
                    isAi={true}
                />
            </div>
        </div>
    );
}

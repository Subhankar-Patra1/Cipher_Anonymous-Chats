import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import SparkleLogo from './icons/SparkleLogo';
import { useAiChat } from '../context/AiChatContext';
import { useConfirm } from '../context/ConfirmationContext';

// ─── Welcome View ────────────────────────────────────────────────────────────
function WelcomeView({ onPromptClick }) {
    const suggested = [
        'Tell me a fun fact about space',
        'How do I cook pasta?',
        'Write a poem about coding',
        'Explain quantum physics simply'
    ];

    return (
        <div className="flex-1 flex flex-col items-center justify-start p-8 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto min-h-0 w-full">
            <div className="my-auto flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-fuchsia-100 to-purple-100 dark:from-fuchsia-500/20 dark:to-purple-500/20 flex items-center justify-center mb-6 shadow-xl shadow-fuchsia-500/10 dark:shadow-none shrink-0">
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
                            className="p-4 text-sm text-left bg-white dark:bg-[#232326] border border-slate-200 dark:border-[#2A2A2D] rounded-xl hover:bg-fuchsia-50 dark:hover:bg-[#2A2A2D] hover:border-fuchsia-200 dark:hover:border-fuchsia-700/50 transition-all duration-200 shadow-sm hover:shadow-md group"
                        >
                            <span className="text-slate-700 dark:text-slate-200 group-hover:text-fuchsia-700 dark:group-hover:text-fuchsia-300 font-medium">
                                {text}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Setup Prompt ────────────────────────────────────────────────────────────
function SetupPrompt({ onCloudStart, onLocalStart, onBack, initialStep = 'choice' }) {
    const [step, setStep] = useState(initialStep);

    if (step === 'local-details') {
        return (
            <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-[#1D1D21] items-center justify-center p-8 text-center animate-in slide-in-from-right duration-500">
                <div className="w-24 h-24 rounded-full bg-fuchsia-100 dark:bg-fuchsia-500/20 flex items-center justify-center mb-6 shadow-xl shadow-fuchsia-500/10 dark:shadow-none">
                    <SparkleLogo className="w-12 h-12 text-fuchsia-500" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Local AI Setup</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
                    To run privately on your device, I need to download the AI model.
                    This is a one-time download of about{' '}
                    <strong className="text-slate-900 dark:text-white">~400MB</strong>.
                </p>

                <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 text-[13px] text-amber-800 dark:text-amber-200 mb-3 max-w-sm text-left shadow-sm">
                    <div className="flex items-center gap-2 mb-2 font-bold uppercase text-[9px] tracking-widest text-amber-600 opacity-80">
                        <span className="material-symbols-outlined text-[16px]">storage</span>
                        Storage Information
                    </div>
                    <p className="mb-1.5 leading-snug">
                        AI models are stored in the{' '}
                        <strong>Browser Cache</strong>. Make sure you have enough free disk space.
                    </p>
                    <p className="text-[11px] opacity-70 leading-normal italic">
                        Requires a browser with <strong>WebGPU</strong> support (Chrome 113+, Edge 113+). Falls back to CPU if unavailable.
                    </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-200 dark:border-blue-800/50 text-[11px] text-blue-800 dark:text-blue-200 mb-6 max-w-sm flex gap-2.5 text-left shadow-sm">
                    <span className="material-symbols-outlined text-[16px] text-blue-500 shrink-0">info</span>
                    <p className="leading-normal">
                        The model is cached in <strong>this browser only</strong>. Chrome cannot see files from Edge or Firefox.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                    <button
                        onClick={onLocalStart}
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
        <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-[#1D1D21] items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="w-24 h-24 rounded-full bg-fuchsia-100 dark:bg-fuchsia-500/20 flex items-center justify-center mb-6 shadow-xl shadow-fuchsia-500/10 dark:shadow-none">
                <SparkleLogo className="w-12 h-12 text-fuchsia-500" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Enable Sparkle AI</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
                Choose how you want to interact with Sparkle AI. Run it{' '}
                <strong className="text-slate-900 dark:text-white">instantly via the cloud</strong> or download it to run{' '}
                <strong className="text-slate-900 dark:text-white">privately on your device</strong>.
            </p>

            <div className="grid grid-cols-1 gap-4 w-full max-w-lg mb-8">
                {/* Cloud Option */}
                <button
                    onClick={onCloudStart}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-[#232326] border border-slate-200 dark:border-[#2A2A2D] rounded-2xl text-left hover:border-sky-500 dark:hover:border-sky-500 hover:shadow-lg hover:shadow-sky-500/5 transition-all group"
                >
                    <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center text-sky-500 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-2xl">bolt</span>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-slate-900 dark:text-white">Instant Cloud AI</span>
                            <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 text-[9px] font-black uppercase rounded-md">
                                Recommended
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Ultra-fast, smart, and requires no download. Powered by Groq Cloud.
                        </p>
                    </div>
                </button>

                {/* Local Option */}
                <button
                    onClick={() => setStep('local-details')}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-[#232326] border border-slate-200 dark:border-[#2A2A2D] rounded-2xl text-left hover:border-fuchsia-500 dark:hover:border-fuchsia-500 hover:shadow-lg hover:shadow-fuchsia-500/5 transition-all group"
                >
                    <div className="w-12 h-12 rounded-xl bg-fuchsia-50 dark:bg-fuchsia-900/20 flex items-center justify-center text-fuchsia-500 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-2xl">terminal</span>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-slate-900 dark:text-white">Private Local AI</span>
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-bold rounded-md">
                                ~400MB
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Total privacy. Runs entirely on your hardware. Works offline.
                        </p>
                    </div>
                </button>
            </div>

            <div className="bg-slate-100/50 dark:bg-slate-900/50 px-4 py-3 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto flex items-center gap-3">
                <span className="material-symbols-outlined text-sm opacity-60">info</span>
                <p className="leading-tight text-left">
                    You can switch between modes anytime from the chat header settings.
                </p>
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

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AIChatWindow({ socket, room, user, onBack, isLoading }) {
    const { token } = useAuth();
    const confirm = useConfirm();

    const {
        getChatState,
        registerRoom,
        sendQuery,
        cancelAi,
        clearAiChat,
        regenerate,
        setMessages: setContextMessages,
        deleteMessageLocal,
        syncMessages,
        initEngine,
        isModelLoading,
        modelProgress,
        isDownloading,
        isSetupComplete,
        setIsSetupComplete,
        isLocalModelSetupComplete,
        setIsLocalModelSetupComplete,
        isPaused,
        cancelDownload,
        pauseDownload,
        resetAi,
        aiProvider,
        setAiProvider
    } = useAiChat();

    const [aiName] = useState('Sparkle AI');
    const [showMenu, setShowMenu] = useState(false);
    const justClearedRef = useRef(false);
    const [replyTo, setReplyTo] = useState(null);

    const { messages, isAiThinking, currentAiOp, insertIndex } = getChatState(room.id);

    // Auto-init if local setup is complete
    useEffect(() => {
        if (isSetupComplete && aiProvider === 'local' && isLocalModelSetupComplete) {
            initEngine();
        }
    }, [initEngine, isSetupComplete, aiProvider, isLocalModelSetupComplete]);

    // Sync messages when ready
    useEffect(() => {
        const showLocalDownload = aiProvider === 'local' && !isLocalModelSetupComplete;
        const showSetup = !isSetupComplete || showLocalDownload;
        const isLocalLoading = aiProvider === 'local' && isModelLoading;

        if (showSetup || isLocalLoading || isPaused) return;

        syncMessages(room.id);
        if (socket) socket.emit('join_room', room.id);
        registerRoom(room.id, []);
    }, [room.id, registerRoom, syncMessages, aiProvider, isLocalModelSetupComplete, isSetupComplete, isModelLoading, isPaused, socket]);

    // ── Setup Gate ──────────────────────────────────────────────────────────
    const showLocalDownload = aiProvider === 'local' && !isLocalModelSetupComplete;
    const showSetup = !isSetupComplete || showLocalDownload;

    if (showSetup) {
        return (
            <SetupPrompt
                initialStep={showLocalDownload ? 'local-details' : 'choice'}
                onCloudStart={() => {
                    setAiProvider('groq');
                    setIsSetupComplete(true);
                }}
                onLocalStart={() => {
                    // [FIX] Mark setup flags THEN start downloading
                    setIsSetupComplete(true);
                    setIsLocalModelSetupComplete(true);
                    initEngine();
                }}
                onBack={onBack}
            />
        );
    }

    // ── Paused ──────────────────────────────────────────────────────────────
    if (isPaused) {
        return (
            <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-[#1D1D21] items-center justify-center p-8 text-center animate-in fade-in duration-500">
                <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-4xl text-amber-500">pause_circle</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Setup Paused</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-xs mb-8">
                    Your progress has been saved. Resume anytime.
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
                        onClick={() => { cancelDownload(); onBack(); }}
                        className="py-3 px-6 text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-white transition-colors"
                    >
                        Quit Setup
                    </button>
                </div>
            </div>
        );
    }

    // ── Download Progress (Local only) ──────────────────────────────────────
    if (aiProvider === 'local' && (isModelLoading || modelProgress?.status === 'error')) {
        return (
            <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-[#1D1D21] items-center justify-center p-8 text-center space-y-6 animate-in fade-in duration-300">
                <div className="w-24 h-24 relative flex items-center justify-center">
                    {modelProgress?.status === 'error' ? (
                        <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-4xl text-red-500">error</span>
                        </div>
                    ) : (
                        <>
                            <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-800" />
                            <div className="absolute inset-0 rounded-full border-4 border-fuchsia-500 border-t-transparent animate-spin" />
                            <SparkleLogo className="w-10 h-10 text-fuchsia-500 animate-pulse" />
                        </>
                    )}
                </div>

                <div className="space-y-3 max-w-md">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {modelProgress?.status === 'error'
                            ? 'Setup Failed'
                            : modelProgress?.status === 'searching'
                                ? 'Searching for AI'
                                : isDownloading
                                    ? 'Downloading AI Model'
                                    : 'Initializing AI'}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400">
                        {modelProgress?.status === 'error'
                            ? 'An error occurred while loading the AI model. This can happen if your GPU memory is full or the connection was interrupted.'
                            : modelProgress?.status === 'searching'
                                ? 'Checking if you already have the Sparkle AI core on this device...'
                                : isDownloading
                                    ? 'Downloading the model to your device. This happens only once. (~400MB)'
                                    : 'Optimizing AI for your device. This will only take a moment...'}
                    </p>

                    {/* Progress box — only during download or search */}
                    {modelProgress && modelProgress.status !== 'error' && (isDownloading || modelProgress.status === 'searching') && (
                        <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800 shadow-sm w-full">
                            <div className="flex justify-between text-xs font-mono mb-2 text-slate-500 dark:text-slate-400">
                                <span className="truncate max-w-[200px]">{modelProgress.file || 'Preparing...'}</span>
                                <span>
                                    {modelProgress.status === 'searching'
                                        ? 'Checking...'
                                        : `${Math.round(modelProgress.progress || 0)}%`}
                                </span>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full bg-fuchsia-500 transition-all duration-300 ${modelProgress.status === 'searching' ? 'animate-pulse w-full' : ''}`}
                                    style={modelProgress.status !== 'searching' ? { width: `${modelProgress.progress || 0}%` } : {}}
                                />
                            </div>
                            <div className="mt-2 text-xs text-slate-400 text-left capitalize">
                                {modelProgress.status}
                            </div>
                        </div>
                    )}

                    {/* Bouncing dots when initializing (not downloading, not error) */}
                    {!isDownloading && modelProgress?.status !== 'error' && modelProgress?.status !== 'searching' && (
                        <div className="flex items-center gap-2 justify-center py-4">
                            <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-bounce" />
                        </div>
                    )}

                    {/* Error state */}
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

                    {/* Pause / Cancel during download */}
                    {isDownloading && modelProgress?.status !== 'error' && (
                        <div className="flex gap-3 w-full max-w-xs mx-auto mt-4">
                            <button
                                onClick={pauseDownload}
                                className="flex-1 py-2 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">pause</span>
                                Pause
                            </button>
                            <button
                                onClick={() => { cancelDownload(); setIsLocalModelSetupComplete(false); }}
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

    // ── Handlers ────────────────────────────────────────────────────────────
    const handleSend = (content, replyToMsg) => {
        setReplyTo(null);
        sendQuery(room.id, content, replyToMsg);
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
            clearAiChat(room.id);
            await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (socket) socket.emit('chat:cleared', { roomId: room.id });
        } catch (e) {
            console.error(e);
            justClearedRef.current = false;
        }
    };

    const handleLocalDelete = (messageId) => deleteMessageLocal(room.id, messageId);

    const handleRegenerate = async (aiMessageId) => {
        const aiMsgIndex = messages.findIndex(m => m.id === aiMessageId);
        if (aiMsgIndex === -1) return;

        let prompt = null;
        for (let i = aiMsgIndex - 1; i >= 0; i--) {
            if (messages[i].user_id === user.id) {
                prompt = messages[i].content;
                break;
            }
        }
        if (!prompt) return;

        handleLocalDelete(aiMessageId);
        regenerate(room.id, prompt, aiMsgIndex, aiMessageId);
    };

    // ── Build displayed messages ─────────────────────────────────────────────
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

    const handleSetMessages = (action) => {
        const newResult = typeof action === 'function' ? action(displayedMessages) : action;
        const cleanMessages = newResult.filter(m => m.id !== 'streaming-ai' && m.id !== 'thinking-ai');
        setContextMessages(room.id, cleanMessages);
    };

    const isEmpty = displayedMessages.length === 0 && !isLoading && !isAiThinking && !currentAiOp;
    const isGenerating = !!currentAiOp && currentAiOp.isStreaming !== false;

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-[#1D1D21] relative overflow-hidden transition-colors animate-in fade-in zoom-in-95 duration-500">
            {/* Background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-fuchsia-100/40 via-slate-50 to-slate-50 dark:from-fuchsia-900/5 dark:via-[#1D1D21] dark:to-[#1D1D21] pointer-events-none transition-colors" />

            {/* Header */}
            <div className="p-4 border-b border-fuchsia-100 dark:border-slate-800/50 bg-white/60 dark:bg-[#1D1D21]/90 backdrop-blur-md flex items-center gap-4 shadow-sm z-10 transition-colors shrink-0">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>

                <div className="flex-1 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-fuchsia-50 dark:bg-fuchsia-900/10 border border-fuchsia-100 dark:border-fuchsia-800/30 shadow-lg shadow-fuchsia-500/10 dark:shadow-none dark:bg-fuchsia-500/10">
                        <SparkleLogo className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            {aiName}
                            <span className="px-2 py-0.5 rounded-full bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-300 text-[10px] font-bold uppercase tracking-wider border border-fuchsia-200 dark:border-fuchsia-500/30">
                                Beta
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                            {isGenerating ? (
                                <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse inline-block" />
                                    Generating...
                                </>
                            ) : (
                                'Always here to help'
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 relative">
                    {/* Provider Switcher */}
                    <div className="hidden sm:flex bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-full mr-1 border border-slate-200/50 dark:border-slate-700/50 shadow-inner backdrop-blur-sm">
                        <button
                            onClick={() => setAiProvider('local')}
                            title="Use Local AI (Private & Offline)"
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all duration-300 ${aiProvider === 'local'
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
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all duration-300 ${aiProvider === 'groq'
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
                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 border shadow-sm shrink-0 ${showMenu
                            ? 'bg-fuchsia-50 dark:bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-500/50'
                            : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-white border-slate-200 dark:border-slate-700'
                            }`}
                    >
                        <span className={`material-symbols-outlined transition-transform duration-300 ${showMenu ? 'rotate-90' : ''}`}>
                            settings
                        </span>
                    </button>

                    {showMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                            <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                <button
                                    onClick={() => { handleClearChat(); setShowMenu(false); }}
                                    className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-3 transition-colors"
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
                                        Provider: {aiProvider === 'groq' ? '☁️ Groq Cloud' : '💻 Local'}
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
                    onRetry={() => {}}
                    onEdit={() => {}}
                    onRegenerate={handleRegenerate}
                />
            )}

            {/* Input */}
            <div className="shrink-0 z-20">
                <MessageInput
                    onSend={(content) => handleSend(content, replyTo)}
                    onSendAudio={() => alert('Voice for AI coming soon!')}
                    onSendGif={() => alert('GIFs for AI coming soon!')}
                    disabled={isGenerating}
                    isGenerating={isGenerating}
                    onStop={cancelAi}
                    replyTo={replyTo}
                    setReplyTo={setReplyTo}
                    isAi={true}
                />
            </div>
        </div>
    );
}
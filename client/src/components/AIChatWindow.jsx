import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { linkifyText } from '../utils/linkify';
import SparkleLogo from './icons/SparkleLogo';
import { useAiChat } from '../context/AiChatContext';

// [NEW] Welcome Component
function WelcomeView({ onPromptClick }) {
    const suggested = [
        "Tell me a fun fact about space",
        "How do I cook pasta?",
        "Write a poem about coding",
        "Explain quantum physics simply"
    ];

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-fuchsia-100 to-purple-100 dark:from-fuchsia-900/20 dark:to-purple-900/20 flex items-center justify-center mb-6 shadow-xl shadow-fuchsia-500/10">
                <SparkleLogo className="w-12 h-12" />
            </div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 mb-3 text-center">
                Welcome to Sparkle AI
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-center max-w-md mb-8 leading-relaxed">
                I'm your personal AI assistant. Ask me anything, or pick a suggestion below to get started!
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
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
    );
}

export default function AIChatWindow({ socket, room, user, onBack, isLoading }) {
    const { token } = useAuth();
    
    // AI Chat State
    const { getChatState, registerRoom, sendQuery, cancelAi, clearAiChat, regenerate, setMessages: setContextMessages, deleteMessageLocal, syncMessages } = useAiChat(); // [FIX] Added syncMessages
    
    // AI Chat State
    const [aiName, setAiName] = useState(() => localStorage.getItem('sparkle_ai_name') || 'Sparkle AI');
    const [showMenu, setShowMenu] = useState(false);
    
    // Derived state from context
    // Derived state from context
    const { messages, isAiThinking, currentAiOp, insertIndex } = getChatState(room.id);

    // We don't need typing users or privileged modals for AI chat
    const [replyTo, setReplyTo] = useState(null);
    const justClearedRef = useRef(false);

    // Initial Load & Normalization
    useEffect(() => {
        // We only normalize if we *don't* have messages yet or if we just mounted
        // Actually, registerRoom handles safe initialization (only if missing)
        // But we might want to normalize the initial messages from props if they are fresh?
        // Let's rely on room.initialMessages passed from Dashboard
        
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
        
        registerRoom(room.id, normalized);
        
        // [FIX] Always sync with server on mount to get latest messages (including stopped ones)
        // Check if we have connectivity or just blindly fetch? Blind fetch is safer for consistency.
        if (justClearedRef.current) {
            justClearedRef.current = false;
            return;
        }
        syncMessages(room.id, aiName);
        
    }, [room.id, room.initialMessages, aiName, registerRoom, syncMessages]);



    const handleSend = (content, replyToMsg) => {
        setReplyTo(null);
        sendQuery(room.id, content, replyToMsg);
    };

    const handleCancelAi = () => {
        cancelAi(room.id);
    };

    const handleClearChat = async () => {
        if (!confirm('Clear all messages in this AI chat?')) return;
        try {
             justClearedRef.current = true;
             // Clear local state immediately
             clearAiChat(room.id);
             
             await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${room.id}/messages`, {
                 method: 'DELETE',
                 headers: { Authorization: `Bearer ${token}` }
             });
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

    if (currentAiOp) {
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
    } else if (isAiThinking) {
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


    // AI Chat distinct UI
    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950 relative overflow-hidden transition-colors">
            {/* Distinct Background for AI */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-fuchsia-100/40 via-slate-50 to-slate-50 dark:from-fuchsia-900/10 dark:via-slate-950 dark:to-slate-950 pointer-events-none transition-colors" />

            {/* AI Header */}
             <div className="p-4 border-b border-fuchsia-100 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md flex items-center gap-4 shadow-sm z-10 transition-colors">
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

                <div className="flex items-center gap-2 relative">
                    <button 
                         onClick={() => setShowMenu(!showMenu)}
                         className="p-2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined">more_vert</span>
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
                                    <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                                    Clear Chat
                                </button>
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
    );
}

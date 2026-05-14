import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { transformersService } from '../services/TransformersService';
import { groqService } from '../services/GroqService';
import { v4 as uuidv4 } from 'uuid';

const AiChatContext = createContext();

export function useAiChat() {
    return useContext(AiChatContext);
}

export function AiChatProvider({ children, socket }) {
    const { token, user } = useAuth();
    const [chats, setChats] = useState(() => {
        try {
            const saved = localStorage.getItem('sparkle_ai_chats');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    });

    // Download/Init State
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [modelProgress, setModelProgress] = useState(null); // { status, file, progress }
    const [isDownloading, setIsDownloading] = useState(false);

    // [SMOOTHING] Refs for buffered streaming
    const streamingQueue = useRef([]);
    const smoothingInterval = useRef(null);
    const isAiDone = useRef(false);
    const [isPaused, setIsPaused] = useState(false); // [NEW]
    const abortControllerRef = useRef(null); // [NEW]
    const isSetupCompleteRef = useRef(null); // Local ref for instant check

    // [NEW] Provider State
    const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('sparkle_ai_provider') || 'groq');
    
    // [NEW] One-time set of the provided Groq key
    useEffect(() => {
        const existingKey = localStorage.getItem('groq_api_key');
        if (!existingKey || existingKey === 'undefined') {
            groqService.setApiKey(import.meta.env.VITE_GROQ_API_KEY);
        }
    }, []);

    // [SMOOTHING] Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (smoothingInterval.current) {
                clearInterval(smoothingInterval.current);
            }
        };
    }, []);

    const [isSetupComplete, setIsSetupComplete] = useState(() => {
        return localStorage.getItem('sparkle_ai_setup_complete') === 'true';
    });

    const [isLocalModelSetupComplete, setIsLocalModelSetupComplete] = useState(() => {
        return localStorage.getItem('sparkle_ai_local_setup_complete') === 'true';
    });

    useEffect(() => {
        try {
            const serializableChats = Object.entries(chats).reduce((acc, [roomId, chat]) => {
                acc[roomId] = {
                    ...chat,
                    isAiThinking: false, 
                    currentAiOp: null    
                };
                return acc;
            }, {});
            localStorage.setItem('sparkle_ai_chats', JSON.stringify(serializableChats));
        } catch (e) {
            console.error("Failed to save AI chats:", e);
        }
    }, [chats]);

    const getChatState = useCallback((roomId) => {
        return chats[roomId] || { messages: [], isAiThinking: false, currentAiOp: null, insertIndex: -1 };
    }, [chats]);

    const registerRoom = useCallback((roomId, initialMessages = []) => {
        setChats(prev => {
            if (prev[roomId]) return prev; 
            return {
                ...prev,
                [roomId]: {
                    messages: initialMessages,
                    isAiThinking: false,
                    currentAiOp: null,
                    insertIndex: -1
                }
            };
        });
    }, []);

    // Initialize Engine
    const initEngine = useCallback(async () => {
        // [FIX] If already ready, skip everything
        if (transformersService.ready) {
            setIsModelLoading(false);
            setModelProgress(null);
            setIsSetupComplete(true);
            setIsLocalModelSetupComplete(true);
            return;
        }

        setIsModelLoading(true);
        setIsPaused(false);
        setIsDownloading(false); // Reset
        abortControllerRef.current = new AbortController();
        
        let foundInCache = false;

        // Always show "Searching" phase for visual feedback
        setModelProgress({ status: 'searching', file: 'Scanning local storage...', progress: 0 });
        // Give UI a moment to show the searching state
        await new Promise(r => setTimeout(r, 800));
        try {
            // First check if already in cache (even if localStorage says not setup)
            // This handles the "second account on same browser" case
            foundInCache = await transformersService.checkCache();
            if (foundInCache && !isLocalModelSetupComplete) {
                setModelProgress({ status: 'searching', file: 'Found existing AI core!', progress: 100 });
                // Small pause so user can see it found the core
                await new Promise(r => setTimeout(r, 600));
                setIsSetupComplete(true);
                setIsLocalModelSetupComplete(true);
                localStorage.setItem('sparkle_ai_setup_complete', 'true');
                localStorage.setItem('sparkle_ai_local_setup_complete', 'true');
            }

            await transformersService.initialize((data) => {
                // data: { status: 'progress', file: '...', progress: 45 }
                
                // If it's a real network download, mark it as such
                if (!foundInCache && (data.status === 'download' || data.status === 'progress' || data.status === 'initiate')) {
                    setIsDownloading(true);
                }

                // Clean up the status for the UI
                const displayStatus = foundInCache ? 'Loading' : (data.status === 'progress' || data.status === 'download' ? 'Downloading' : data.status);
                
                setModelProgress({
                    ...data,
                    status: displayStatus 
                });
            }, abortControllerRef.current.signal);

            // Final smoothing delay when finished
            setModelProgress({ status: 'Loading', file: 'Setup complete! Synchronizing...', progress: 100 });
            await new Promise(r => setTimeout(r, 1000));

            setIsModelLoading(false);
            setModelProgress(null);
            setIsDownloading(false);
            setIsSetupComplete(true);
            setIsLocalModelSetupComplete(true);
            localStorage.setItem('sparkle_ai_setup_complete', 'true');
            localStorage.setItem('sparkle_ai_local_setup_complete', 'true');
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log("Download aborted by user");
                setIsModelLoading(false);
                return;
            }
            console.error("Failed to init local AI:", e);
            setIsModelLoading(false);
            setModelProgress({ status: 'error', error: e.message });
        } finally {
            abortControllerRef.current = null;
        }
    }, [isSetupComplete]);

    // Handle Local Generation
    const sendQuery = async (roomId, content, replyToMsg) => {
        if (!user) return;
        
        // Ensure engine is ready
        if (!transformersService.ready && !isModelLoading) {
            initEngine(); // Trigger lazy load
            // We might want to show a "Booting UI" here.
        }

        const operationId = uuidv4();
        const tempId = `temp-${Date.now()}`;
        
        // 1. Add User Message Optimized
        const tempMsg = {
            id: tempId,
            room_id: roomId,
            user_id: user.id,
            content,
            replyTo: replyToMsg || null,
            created_at: new Date().toISOString(),
            status: 'sending',
            meta: { operationId }
        };

        setChats(prev => ({
            ...prev,
            [roomId]: {
                ...prev[roomId],
                messages: [...(prev[roomId]?.messages || []), tempMsg],
                isAiThinking: true,
                currentAiOp: { id: operationId, content: '', isStreaming: true, finished: false }
            }
        }));

        // 2. Persist User Message to Database via AI endpoint
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/save-user`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ 
                    roomId,
                    content,
                    operationId,
                    meta: { aiQuery: true }
                })
            });

            
            if (res.ok) {
                const serverMsg = await res.json();
                // Update local message with server ID and status
                setChats(prev => {
                    if (!prev[roomId]) return prev;
                    return {
                        ...prev,
                        [roomId]: {
                            ...prev[roomId],
                            messages: prev[roomId].messages.map(m => 
                                m.id === tempId 
                                    ? { ...m, id: serverMsg.id, status: m.status === 'seen' ? 'seen' : 'sent' }
                                    : m
                            )
                        }
                    };
                });
            }
        } catch(e) {
            console.error("Failed to save user message:", e);
        }

        // 3. Build conversation history for context
        const chatState = chats[roomId];
        const historyMessages = chatState?.messages || [];
        
        // Build Qwen/ChatML multi-turn conversation format
        // Limit to last N messages to avoid token overflow
        const MAX_HISTORY = 20;

        const recentMessages = historyMessages.slice(-MAX_HISTORY);
        
        let conversationPrompt = `<|im_start|>system\nYou are Sparkle AI, a friendly and helpful AI assistant. Your name is Sparkle AI. You must NEVER identify as Claude or any other AI. Provide concise, clear, and professional responses. If asked for your name, always say "I am Sparkle AI".<|im_end|>\n`;

        // Add previous messages as context
        for (const msg of recentMessages) {
            const isAi = msg.user_id === 'ai-assistant' || msg.meta?.ai;
            const role = isAi ? 'assistant' : 'user';
            conversationPrompt += `<|im_start|>${role}\n${msg.content}<|im_end|>\n`;
        }

        // Add the current user message
        conversationPrompt += `<|im_start|>user\n${content}<|im_end|>\n<|im_start|>assistant\n`;

        // 4. Generate Response with full context
        isAiDone.current = false;
        
        // [NEW] Use AbortController for real-time stopping
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        const onToken = (token) => {
            // Background buffering, but we don't update UI until done (Gemini-style reveal)
            // We just keep the skeleton spinning.
        };

        const onDone = async (fullText) => {
            setChats(prev => {
                if (!prev[roomId]) return prev;
                const chat = prev[roomId];
                const op = chat.currentAiOp;
                
                // If the operation is already finished or doesn't match, ignore
                if (!op || op.id !== operationId || op.finished) return prev;

                return {
                    ...prev,
                    [roomId]: {
                        ...chat,
                        isAiThinking: false, 
                        currentAiOp: { ...op, content: fullText, isStreaming: false, finished: true },
                        // Mark user's message as 'seen'
                        messages: chat.messages.map(m => 
                            m.meta?.operationId === operationId && (m.user_id !== 'ai-assistant' && !m.meta?.ai)
                                ? { ...m, status: 'seen' }
                                : m
                        )
                    }
                };
            });

            // Persist to Server
            await saveAiMessage(roomId, fullText, operationId);
        };

        const onError = (error) => {
            if (error === 'Aborted' || error?.name === 'AbortError') {
                console.log("[AiChatContext] AI Generation Aborted by user");
                return;
            }
            console.error(`${aiProvider} AI Error:`, error);
            setChats(prev => {
                if (!prev[roomId]) return prev;
                return {
                    ...prev,
                    [roomId]: {
                        ...prev[roomId],
                        isAiThinking: false,
                        currentAiOp: null,
                        messages: [...prev[roomId].messages, {
                            id: `err-${Date.now()}`,
                            room_id: roomId,
                            type: 'system',
                            content: `Error (${aiProvider}): ${error}`,
                            created_at: new Date().toISOString()
                        }]
                    }
                };
            });
        };

        // ROUTE TO PROVIDER
        if (aiProvider === 'groq') {
            const systemPrompt = `You are Sparkle AI, a friendly and helpful AI assistant. Your name is Sparkle AI. You must NEVER identify as Claude or any other AI. Provide concise, clear, and professional responses. If asked for your name, always say "I am Sparkle AI".`;
            const groqMessages = [
                { role: 'system', content: systemPrompt },
                ...recentMessages.map(m => ({
                    role: m.user_id === 'ai-assistant' || m.meta?.ai ? 'assistant' : 'user',
                    content: m.content
                })),
                { role: 'user', content: content }
            ];
            groqService.generateStream(groqMessages, onToken, onDone, onError, abortControllerRef.current.signal);
        } else {
            transformersService.generateStream(conversationPrompt, onToken, onDone, onError, abortControllerRef.current.signal);
        }
    };

    const saveAiMessage = async (roomId, content, operationId) => {
         try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/save`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ roomId, content, operationId })
            });
            const data = await res.json();
            
            if (data.ok) {
                // [FIX] After save, add the AI message to messages array and clear currentAiOp
                setChats(prev => {
                    if (!prev[roomId]) return prev;
                    
                    // [FIX] Deduplicate before adding! 
                    // This prevents duplication on the sender tab if the socket arrives before the fetch response.
                    const exists = prev[roomId].messages.some(m => 
                        String(m.id) === String(data.id) || 
                        (m.meta?.operationId === operationId && (m.user_id === 'ai-assistant' || m.meta?.ai))
                    );
                    
                    if (exists) {
                        return {
                            ...prev,
                            [roomId]: {
                                ...prev[roomId],
                                currentAiOp: null, // Still clear the streaming op
                                messages: prev[roomId].messages.map(m => {
                                    const isMatch = String(m.id) === String(data.id) || 
                                                   (m.meta?.operationId === operationId && (m.user_id === 'ai-assistant' || m.meta?.ai));
                                    return isMatch ? { ...m, id: data.id, content } : m;
                                })
                            }
                        };
                    }

                    const newMsg = {
                        id: data.id,
                        room_id: roomId,
                        user_id: 'ai-assistant',
                        display_name: 'Sparkle AI',
                        content,
                        created_at: new Date().toISOString(),
                        type: 'text',
                        meta: { ai: true, operationId }
                    };
                    return {
                        ...prev,
                        [roomId]: {
                            ...prev[roomId],
                            currentAiOp: null, // Clear the streaming op
                            messages: [...prev[roomId].messages, newMsg]
                        }
                    };
                });
            }
         } catch(e) {
             console.error("Failed to save AI message:", e);
         }
    };


    const cancelAi = () => {
        // [FIX] Use the AbortController to actually stop the model work
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            console.log("[AiChatContext] User clicked Stop/Cancel");
        }

        setChats(prev => {
             // Clear any active thinking/streaming states across all rooms
             const newState = { ...prev };
             Object.keys(newState).forEach(roomId => {
                 if (newState[roomId].currentAiOp || newState[roomId].isAiThinking) {
                    newState[roomId] = {
                        ...newState[roomId],
                        isAiThinking: false,
                        currentAiOp: null
                    };
                 }
             });
             return newState;
        });
    };

    // Socket: We still listen for 'new_message' to sync history!
    useEffect(() => {
        if (!socket) return;
        const handleNewMessage = (msg) => {
            setChats(prev => {
                const targetRoomId = msg.room_id;
                if (!prev[targetRoomId]) return prev;
                
                const isAi = msg.meta?.ai || msg.author_name === 'Assistant';
                
                // [FIX] Strict Deduplication: Check ID OR (Operation ID + Role)
                // This prevents "double-send" and "triple-response" by ensuring 
                // we don't accidentally match a User Query against an AI Response.
                const exists = prev[targetRoomId].messages.some(m => {
                    const mIsAi = m.meta?.ai || m.user_id === 'ai-assistant';
                    return String(m.id) === String(msg.id) || 
                           (msg.meta?.operationId && m.meta?.operationId === msg.meta.operationId && isAi === mIsAi);
                });
                
                // [FIX] Check if this message resolves the current AI operation
                const currentOp = prev[targetRoomId].currentAiOp;
                const matchesOp = currentOp && msg.meta && msg.meta.operationId === currentOp.id && isAi;

                if (exists) {
                    // Update the existing message (replaces temp/optimistic with real canonical message)
                    const updatedMessages = prev[targetRoomId].messages.map(m => {
                        const mIsAi = m.meta?.ai || m.user_id === 'ai-assistant';
                        const isMatch = String(m.id) === String(msg.id) || 
                                       (msg.meta?.operationId && m.meta?.operationId === msg.meta.operationId && isAi === mIsAi);
                        return isMatch ? msg : m;
                    });

                    return {
                        ...prev,
                        [targetRoomId]: {
                            ...prev[targetRoomId],
                            messages: updatedMessages,
                            currentAiOp: matchesOp ? null : prev[targetRoomId].currentAiOp,
                            isAiThinking: matchesOp ? false : prev[targetRoomId].isAiThinking
                        }
                    };
                }
                
                // [NEW] If this is an AI response, also mark the corresponding user query as 'seen'
                // This ensures "Seen" status (double ticks) syncs across tabs instantly.
                const finalMessages = isAi 
                    ? [...prev[targetRoomId].messages.map(m => 
                        (m.meta?.operationId === msg.meta?.operationId && !m.meta?.ai) 
                        ? { ...m, status: 'seen' } 
                        : m
                      ), msg]
                    : [...prev[targetRoomId].messages, msg];

                return {
                    ...prev,
                    [targetRoomId]: {
                        ...prev[targetRoomId],
                        // If it matches, clear the temp op because we now have the real message
                        currentAiOp: matchesOp ? null : prev[targetRoomId].currentAiOp,
                        isAiThinking: matchesOp ? false : prev[targetRoomId].isAiThinking,
                        messages: finalMessages
                    }
                };
            });
        };
        socket.on('new_message', handleNewMessage);
        return () => socket.off('new_message', handleNewMessage);
    }, [socket]);
    
    // ... Copy other helpers like syncMessages ...
    const syncMessages = useCallback(async (roomId) => {
        // ... same implementation as before ...
         try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/messages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                // [FIX] Deduplicate messages by ID
                const seen = new Set();
                const uniqueMessages = data.filter(m => {
                    if (seen.has(m.id)) return false;
                    seen.add(m.id);
                    return true;
                });
                setChats(prev => ({
                    ...prev,
                    [roomId]: {
                        ...(prev[roomId] || {}),
                        messages: uniqueMessages
                    }
                }));
            }
        } catch(e) {}
    }, [token]);


    const cancelDownload = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsModelLoading(false);
            setModelProgress(null);
        }
    };

    const pauseDownload = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsPaused(true);
            setIsModelLoading(false);
            // We keep modelProgress so UI shows where we stopped
        }
    };

    const clearAiChat = (roomId) => {
        setChats(prev => {
            if (!prev[roomId]) return prev;
            return {
                ...prev,
                [roomId]: {
                    ...prev[roomId],
                    messages: [],
                    currentAiOp: null,
                    isAiThinking: false
                }
            };
        });
    };

    const resetAi = async () => {
        await transformersService.reset();
        setIsModelLoading(false);
        setModelProgress(null);
        // Force reload of page to clear memory state?
        window.location.reload();
    };

    return (
        <AiChatContext.Provider value={{ 
            chats, 
            getChatState, 
            registerRoom, 
            sendQuery, 
            cancelAi,
            clearAiChat,    // [FIX] Added
            syncMessages,
            initEngine,     // [NEW]
            isModelLoading, // [NEW]
            modelProgress,   // [NEW]
            isDownloading,   // [NEW]
            isSetupComplete, 
            setIsSetupComplete: (val) => {
                setIsSetupComplete(val);
                localStorage.setItem('sparkle_ai_setup_complete', val ? 'true' : 'false');
            },
            isLocalModelSetupComplete,
            setIsLocalModelSetupComplete: (val) => {
                setIsLocalModelSetupComplete(val);
                localStorage.setItem('sparkle_ai_local_setup_complete', val ? 'true' : 'false');
            },
            isPaused,        // [NEW]
            cancelDownload,  // [NEW]
            pauseDownload,   // [NEW]
            resetAi,         // [NEW]
            aiProvider,      // [NEW]
            setAiProvider: (p) => {
                setAiProvider(p);
                localStorage.setItem('sparkle_ai_provider', p);
            },
            setGroqKey: (key) => groqService.setApiKey(key)
        }}>
            {children}
        </AiChatContext.Provider>
    );
}

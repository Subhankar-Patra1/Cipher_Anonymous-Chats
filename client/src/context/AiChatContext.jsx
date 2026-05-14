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
    const [modelProgress, setModelProgress] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    // [FIX] Separate abort controllers: one for download, one for generation
    const downloadAbortRef = useRef(null);
    const generationAbortRef = useRef(null);

    // [FIX] Refs for stale-closure-safe flags
    const isLocalModelSetupCompleteRef = useRef(false);
    const isSetupCompleteRef = useRef(false);

    // [NEW] Provider State
    const [aiProvider, setAiProvider] = useState(
        () => localStorage.getItem('sparkle_ai_provider') || 'groq'
    );

    // [NEW] One-time set of the provided Groq key
    useEffect(() => {
        const envKey = import.meta.env.VITE_GROQ_API_KEY;
        const existingKey = localStorage.getItem('groq_api_key');
        
        // Priority 1: Use the secure key from .env if available
        if (envKey && envKey.startsWith('gsk_')) {
            groqService.setApiKey(envKey);
            // Sync to localStorage so other parts of the app can see it
            if (envKey !== existingKey) {
                localStorage.setItem('groq_api_key', envKey);
            }
        } 
        // Priority 2: Fallback to existing localStorage key
        else if (existingKey && existingKey.startsWith('gsk_')) {
            groqService.setApiKey(existingKey);
        }
    }, []);

    const [isSetupComplete, _setIsSetupComplete] = useState(() => {
        const val = localStorage.getItem('sparkle_ai_setup_complete') === 'true';
        isSetupCompleteRef.current = val;
        return val;
    });

    const setIsSetupComplete = useCallback((val) => {
        isSetupCompleteRef.current = val;
        _setIsSetupComplete(val);
        localStorage.setItem('sparkle_ai_setup_complete', val ? 'true' : 'false');
    }, []);

    const [isLocalModelSetupComplete, _setIsLocalModelSetupComplete] = useState(() => {
        const val = localStorage.getItem('sparkle_ai_local_setup_complete') === 'true';
        isLocalModelSetupCompleteRef.current = val;
        return val;
    });

    const setIsLocalModelSetupComplete = useCallback((val) => {
        isLocalModelSetupCompleteRef.current = val;
        _setIsLocalModelSetupComplete(val);
        localStorage.setItem('sparkle_ai_local_setup_complete', val ? 'true' : 'false');
    }, []);

    // Persist chats to localStorage (excluding ephemeral state)
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
            console.error('Failed to save AI chats:', e);
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

    // ─── Initialize Local Engine ────────────────────────────────────────────────
    const initEngine = useCallback(async () => {
        if (transformersService.ready) {
            setIsModelLoading(false);
            setModelProgress(null);
            setIsSetupComplete(true);
            setIsLocalModelSetupComplete(true);
            return;
        }

        // [FIX] Use separate downloadAbortRef
        if (downloadAbortRef.current) {
            downloadAbortRef.current.abort();
        }
        downloadAbortRef.current = new AbortController();

        setIsModelLoading(true);
        setIsPaused(false);
        setIsDownloading(false);

        let foundInCache = false;

        setModelProgress({ status: 'searching', file: 'Scanning local storage...', progress: 0 });
        await new Promise(r => setTimeout(r, 800));

        try {
            foundInCache = await transformersService.checkCache();

            // [FIX] Use ref instead of stale closure value
            if (foundInCache && !isLocalModelSetupCompleteRef.current) {
                setModelProgress({ status: 'searching', file: 'Found existing AI core!', progress: 100 });
                await new Promise(r => setTimeout(r, 600));
                setIsSetupComplete(true);
                setIsLocalModelSetupComplete(true);
            }

            await transformersService.initialize((data) => {
                if (!foundInCache && (
                    data.status === 'download' ||
                    data.status === 'progress' ||
                    data.status === 'initiate'
                )) {
                    setIsDownloading(true);
                }

                const displayStatus = foundInCache
                    ? 'Loading'
                    : (data.status === 'progress' || data.status === 'download'
                        ? 'Downloading'
                        : data.status);

                setModelProgress({ ...data, status: displayStatus });
            }, downloadAbortRef.current.signal);

            setModelProgress({ status: 'Loading', file: 'Setup complete! Synchronizing...', progress: 100 });
            await new Promise(r => setTimeout(r, 800));

            setIsModelLoading(false);
            setModelProgress(null);
            setIsDownloading(false);
            setIsSetupComplete(true);
            setIsLocalModelSetupComplete(true);
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log('[AiChatContext] Download aborted');
                setIsModelLoading(false);
                return;
            }
            console.error('Failed to init local AI:', e);
            setIsModelLoading(false);
            setModelProgress({ status: 'error', error: e.message });
        } finally {
            downloadAbortRef.current = null;
        }
    }, []); // No deps — uses refs for stale values

    // ─── Send Query ─────────────────────────────────────────────────────────────
    const sendQuery = async (roomId, content, replyToMsg) => {
        if (!user) return;

        // [FIX] Guard: if local mode and model not ready, don't proceed
        if (aiProvider === 'local' && !transformersService.ready) {
            if (!isModelLoading) {
                initEngine();
            }
            // Show a system message instead of hanging silently
            setChats(prev => ({
                ...prev,
                [roomId]: {
                    ...prev[roomId],
                    messages: [
                        ...(prev[roomId]?.messages || []),
                        {
                            id: `sys-${Date.now()}`,
                            room_id: roomId,
                            type: 'system',
                            content: 'Local AI is still loading. Please wait a moment and try again.',
                            created_at: new Date().toISOString()
                        }
                    ]
                }
            }));
            return;
        }

        const operationId = uuidv4();
        const tempId = `temp-${Date.now()}`;

        // 1. Add user message optimistically
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

        // 2. Persist user message to server
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/save-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ roomId, content, operationId, meta: { aiQuery: true } })
            });

            if (res.ok) {
                const serverMsg = await res.json();
                setChats(prev => {
                    if (!prev[roomId]) return prev;
                    return {
                        ...prev,
                        [roomId]: {
                            ...prev[roomId],
                            messages: prev[roomId].messages.map(m =>
                                m.id === tempId
                                    ? { ...m, id: serverMsg.id, status: 'sent' }
                                    : m
                            )
                        }
                    };
                });
            }
        } catch (e) {
            console.error('Failed to save user message:', e);
        }

        // 3. Build conversation history
        // [FIX] Snapshot chats synchronously before setChats resolved
        //       Use a stable snapshot via functional update peek
        const chatSnapshot = chats[roomId];
        const historyMessages = (chatSnapshot?.messages || []).filter(
            m => m.id !== tempId // exclude the message we just added (not yet in state)
        );

        const MAX_HISTORY = 20;
        const recentMessages = historyMessages.slice(-MAX_HISTORY);

        // 4. Abort any previous generation (NOT download)
        if (generationAbortRef.current) {
            generationAbortRef.current.abort();
        }
        generationAbortRef.current = new AbortController();

        // [FIX] Real streaming: update currentAiOp.content with each token
        const onToken = (token) => {
            setChats(prev => {
                const chat = prev[roomId];
                if (!chat || !chat.currentAiOp || chat.currentAiOp.id !== operationId) return prev;
                return {
                    ...prev,
                    [roomId]: {
                        ...chat,
                        isAiThinking: false,
                        currentAiOp: {
                            ...chat.currentAiOp,
                            content: (chat.currentAiOp.content || '') + token,
                            isStreaming: true,
                            finished: false
                        }
                    }
                };
            });
        };

        const onDone = async (fullText) => {
            // Use functional update to get latest state
            setChats(prev => {
                const chat = prev[roomId];
                if (!chat) return prev;
                const op = chat.currentAiOp;
                if (!op || op.id !== operationId || op.finished) return prev;

                // Determine final text: for groq streaming, fullText may be empty
                // because tokens already accumulated in content. Use whichever is longer.
                const finalText = fullText && fullText.length > (op.content || '').length
                    ? fullText
                    : (op.content || fullText || '');

                return {
                    ...prev,
                    [roomId]: {
                        ...chat,
                        isAiThinking: false,
                        currentAiOp: {
                            ...op,
                            content: finalText,
                            isStreaming: false,
                            finished: true
                        },
                        messages: chat.messages.map(m =>
                            m.meta?.operationId === operationId && m.user_id !== 'ai-assistant' && !m.meta?.ai
                                ? { ...m, status: 'seen' }
                                : m
                        )
                    }
                };
            });

            await saveAiMessage(roomId, fullText, operationId);
        };

        const onError = (error) => {
            if (error === 'Aborted' || (typeof error === 'object' && error?.name === 'AbortError')) {
                console.log('[AiChatContext] AI Generation Aborted');
                // Clear streaming op cleanly
                setChats(prev => {
                    if (!prev[roomId]) return prev;
                    const chat = prev[roomId];
                    const op = chat.currentAiOp;
                    if (!op || op.id !== operationId) return prev;
                    // If we have partial content, save it; otherwise just clear
                    if (op.content && op.content.trim()) {
                        // Keep the partial message as-is but mark done
                        return {
                            ...prev,
                            [roomId]: {
                                ...chat,
                                isAiThinking: false,
                                currentAiOp: { ...op, isStreaming: false, finished: true }
                            }
                        };
                    }
                    return {
                        ...prev,
                        [roomId]: {
                            ...chat,
                            isAiThinking: false,
                            currentAiOp: null
                        }
                    };
                });
                return;
            }

            console.error(`[${aiProvider}] AI Error:`, error);
            setChats(prev => {
                if (!prev[roomId]) return prev;
                return {
                    ...prev,
                    [roomId]: {
                        ...prev[roomId],
                        isAiThinking: false,
                        currentAiOp: null,
                        messages: [
                            ...prev[roomId].messages,
                            {
                                id: `err-${Date.now()}`,
                                room_id: roomId,
                                type: 'system',
                                content: `AI Error (${aiProvider}): ${error}`,
                                created_at: new Date().toISOString()
                            }
                        ]
                    }
                };
            });
        };

        // 5. Route to provider
        if (aiProvider === 'groq') {
            const systemPrompt = `You are Sparkle AI, a friendly and helpful AI assistant. Your name is Sparkle AI. You must NEVER identify as Claude or any other AI. Provide concise, clear, and professional responses. If asked for your name, always say "I am Sparkle AI".`;
            const groqMessages = [
                { role: 'system', content: systemPrompt },
                ...recentMessages.map(m => ({
                    role: m.user_id === 'ai-assistant' || m.meta?.ai ? 'assistant' : 'user',
                    content: m.content
                })),
                { role: 'user', content }
            ];
            groqService.generateStream(
                groqMessages,
                onToken,
                onDone,
                onError,
                generationAbortRef.current.signal
            );
        } else {
            // Local: build ChatML prompt
            let conversationPrompt = `<|im_start|>system\nYou are Sparkle AI, a friendly and helpful AI assistant. Your name is Sparkle AI. Provide concise, clear responses. If asked your name, say "I am Sparkle AI".<|im_end|>\n`;

            for (const msg of recentMessages) {
                const isAiMsg = msg.user_id === 'ai-assistant' || msg.meta?.ai;
                const role = isAiMsg ? 'assistant' : 'user';
                if (msg.content) {
                    conversationPrompt += `<|im_start|>${role}\n${msg.content}<|im_end|>\n`;
                }
            }

            // Add current user message
            conversationPrompt += `<|im_start|>user\n${content}<|im_end|>\n<|im_start|>assistant\n`;

            transformersService.generateStream(
                conversationPrompt,
                onToken,
                onDone,
                onError,
                generationAbortRef.current.signal
            );
        }
    };

    // ─── Save AI Message to Server ───────────────────────────────────────────────
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
                setChats(prev => {
                    if (!prev[roomId]) return prev;

                    const exists = prev[roomId].messages.some(m =>
                        String(m.id) === String(data.id) ||
                        (m.meta?.operationId === operationId && (m.user_id === 'ai-assistant' || m.meta?.ai))
                    );

                    if (exists) {
                        return {
                            ...prev,
                            [roomId]: {
                                ...prev[roomId],
                                currentAiOp: null,
                                messages: prev[roomId].messages.map(m => {
                                    const isMatch =
                                        String(m.id) === String(data.id) ||
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
                            currentAiOp: null,
                            messages: [...prev[roomId].messages, newMsg]
                        }
                    };
                });
            }
        } catch (e) {
            console.error('Failed to save AI message:', e);
            // Even if save fails, clear the streaming op so UI doesn't hang
            setChats(prev => {
                if (!prev[roomId]) return prev;
                return {
                    ...prev,
                    [roomId]: { ...prev[roomId], currentAiOp: null }
                };
            });
        }
    };

    // ─── Cancel / Pause / Stop ───────────────────────────────────────────────────
    const cancelAi = () => {
        // [FIX] Only abort generation, not download
        if (generationAbortRef.current) {
            generationAbortRef.current.abort();
            generationAbortRef.current = null;
            console.log('[AiChatContext] User clicked Stop');
        }

        setChats(prev => {
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

    const cancelDownload = () => {
        if (downloadAbortRef.current) {
            downloadAbortRef.current.abort();
            downloadAbortRef.current = null;
        }
        setIsModelLoading(false);
        setModelProgress(null);
        setIsDownloading(false);
        setIsPaused(false);
    };

    const pauseDownload = () => {
        if (downloadAbortRef.current) {
            downloadAbortRef.current.abort();
            downloadAbortRef.current = null;
        }
        setIsPaused(true);
        setIsModelLoading(false);
    };

    // ─── Socket: sync new messages ───────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        const handleNewMessage = (msg) => {
            setChats(prev => {
                const targetRoomId = msg.room_id;
                if (!prev[targetRoomId]) return prev;

                const isAi = msg.meta?.ai || msg.author_name === 'Assistant';

                const exists = prev[targetRoomId].messages.some(m => {
                    const mIsAi = m.meta?.ai || m.user_id === 'ai-assistant';
                    return (
                        String(m.id) === String(msg.id) ||
                        (msg.meta?.operationId && m.meta?.operationId === msg.meta.operationId && isAi === mIsAi)
                    );
                });

                const currentOp = prev[targetRoomId].currentAiOp;
                const matchesOp = currentOp && msg.meta?.operationId === currentOp.id && isAi;

                if (exists) {
                    const updatedMessages = prev[targetRoomId].messages.map(m => {
                        const mIsAi = m.meta?.ai || m.user_id === 'ai-assistant';
                        const isMatch =
                            String(m.id) === String(msg.id) ||
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

                const finalMessages = isAi
                    ? [
                        ...prev[targetRoomId].messages.map(m =>
                            m.meta?.operationId === msg.meta?.operationId && !m.meta?.ai
                                ? { ...m, status: 'seen' }
                                : m
                        ),
                        msg
                    ]
                    : [...prev[targetRoomId].messages, msg];

                return {
                    ...prev,
                    [targetRoomId]: {
                        ...prev[targetRoomId],
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

    // ─── Sync / Utilities ────────────────────────────────────────────────────────
    const syncMessages = useCallback(async (roomId) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/messages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
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
        } catch (e) {
            console.error('syncMessages error:', e);
        }
    }, [token]);

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

    const setMessages = useCallback((roomId, msgs) => {
        setChats(prev => ({
            ...prev,
            [roomId]: {
                ...(prev[roomId] || {}),
                messages: msgs
            }
        }));
    }, []);

    const deleteMessageLocal = useCallback((roomId, messageId) => {
        setChats(prev => {
            if (!prev[roomId]) return prev;
            return {
                ...prev,
                [roomId]: {
                    ...prev[roomId],
                    messages: prev[roomId].messages.filter(m => m.id !== messageId)
                }
            };
        });
    }, []);

    const regenerate = useCallback((roomId, prompt, _aiMsgIndex, _aiMessageId) => {
        // Calls sendQuery without adding extra user message
        // Since we already deleted the old AI message, just send the prompt
        sendQuery(roomId, prompt, null);
    }, [sendQuery]); // eslint-disable-line react-hooks/exhaustive-deps

    const resetAi = async () => {
        await transformersService.reset();
        setIsModelLoading(false);
        setModelProgress(null);
        setIsLocalModelSetupComplete(false);
        window.location.reload();
    };

    return (
        <AiChatContext.Provider value={{
            chats,
            getChatState,
            registerRoom,
            sendQuery,
            cancelAi,
            clearAiChat,
            syncMessages,
            setMessages,
            deleteMessageLocal,
            regenerate,
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
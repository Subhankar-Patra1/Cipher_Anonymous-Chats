import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { renderTextWithEmojis } from '../utils/emojiRenderer';
import { cryptoManager } from '../lib/crypto/CryptoManager';
import { isSingleEmoji, linkToBigEmoji, splitEmojis } from '../utils/animatedEmojiMap'; // [NEW]

export default function StarredMessagesModal({ onClose, onGoToMessage, roomId = null }) { // [NEW] Accept roomId
    const { token, user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStarred = async () => {
            try {
                // [NEW] Filter by Room
                const url = roomId 
                    ? `${import.meta.env.VITE_API_URL}/api/messages/starred?roomId=${roomId}`
                    : `${import.meta.env.VITE_API_URL}/api/messages/starred`;

                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    
                    // Decrypt messages
                    const decryptedData = await Promise.all(data.map(async (msg) => {
                        // If not encrypted or already has clear text content, return as is
                        if (!msg.is_encrypted && msg.content) return msg;
                        if (!msg.ciphertext || !msg.iv) return msg;

                        try {
                            const messageId = msg.temp_id || msg.id;
                            const requiredVersion = msg.key_version || msg.keyVersion || 1;
                            
                            let roomKeyData = await cryptoManager.getRoomKey(String(msg.room_id), requiredVersion);
                            
                            if (!roomKeyData) {
                                const deviceId = cryptoManager.deviceId;
                                const keyRes = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${msg.room_id}/keys/my?deviceId=${deviceId}&version=${requiredVersion}`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                });
                                if (keyRes.ok) {
                                    const keyData = await keyRes.json();
                                    if (keyData.encrypted_key) {
                                        const decryptedKey = await cryptoManager.decryptRoomKey(keyData.encrypted_key);
                                        await cryptoManager.saveRoomKey(String(msg.room_id), decryptedKey, keyData.key_version);
                                        roomKeyData = { key: decryptedKey, version: keyData.key_version };
                                    }
                                }
                            }

                            if (roomKeyData) {
                                const content = await cryptoManager.decryptMessage(
                                    msg.ciphertext, 
                                    msg.iv, 
                                    messageId, 
                                    roomKeyData.key,
                                    msg.distribution_headers,
                                    String(msg.room_id),
                                    requiredVersion
                                );
                                return { ...msg, content, is_encrypted: false };
                            }
                            
                            const content = await cryptoManager.decryptMessage(
                                msg.ciphertext, 
                                msg.iv, 
                                messageId, 
                                null, 
                                msg.distribution_headers,
                                String(msg.room_id),
                                requiredVersion
                            );
                            if (content) return { ...msg, content, is_encrypted: false };

                            return { ...msg, content: '🔒 Encrypted' };

                        } catch (e) {
                            console.error('Decryption failed for starred msg', msg.id, e);
                            return { ...msg, content: '⚠️ Decryption Failed' };
                        }
                    }));

                    setMessages(decryptedData);
                }
            } catch (err) {
                console.error("Failed to fetch starred messages", err);
            } finally {
                setLoading(false);
            }
        };
        fetchStarred();
    }, [token, roomId]);

    const handleUnstar = async (msgId, e) => {
        e.stopPropagation();
        setMessages(prev => prev.filter(m => m.id !== msgId));

        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/messages/${msgId}/star`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err) {
            console.error(err);
        }
    };

    const renderMessageContent = (msg) => {
        // [NEW] Image Preview
        if (msg.type === 'image') {
            return (
                <div className="flex items-center gap-3">
                     <div className="w-12 h-12 rounded overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                        {msg.is_encrypted ? (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <span className="material-symbols-outlined text-sm">lock</span>
                            </div>
                        ) : (
                            <img 
                                src={msg.image_url || msg.thumbnail_url} 
                                alt="Photo" 
                                className="w-full h-full object-cover"
                            />
                        )}
                     </div>
                     <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {msg.caption || 'Photo'}
                     </span>
                </div>
            );
        }

        // [NEW] Big Emoji / Sticker
        if ((linkToBigEmoji(msg.content) || isSingleEmoji(msg.content)) && !msg.is_encrypted) {
             const emojis = splitEmojis(msg.content);
             if (emojis.length > 0) {
                 return (
                     <div className="flex items-center gap-1">
                        {emojis.map((emoji, idx) => {
                             const url = linkToBigEmoji(emoji);
                             const src = url || `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${Array.from(emoji).map(c => c.codePointAt(0).toString(16)).filter(hex => hex !== 'fe0f').join('-')}.png`;
                             return <img key={idx} src={src} alt={emoji} className="w-8 h-8 object-contain" />;
                        })}
                        <span className="text-sm text-slate-500 italic ml-1">Sticker</span>
                     </div>
                 );
             }
        }

        if (msg.type === 'video') return <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">videocam</span> Video</span>;
        
        // [NEW] File Preview
        if (msg.type === 'file') {
             return (
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm">description</span>
                    </div>
                    <span className="text-sm truncate max-w-[150px]">{msg.file_name || 'File'}</span>
                </div>
             );
        }
        
        if (msg.type === 'audio') return <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">mic</span> Voice Message</span>;
        if (msg.type === 'location') return <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">location_on</span> Location</span>;
        if (msg.type === 'poll') return <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">poll</span> Poll</span>;
        
        // Text handler
        if (!msg.content) return <span className="text-slate-400 italic">No content</span>;
        return <span className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300 break-words">{renderTextWithEmojis(msg.content)}</span>;
    };

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh] animate-scale-up border border-slate-200 dark:border-slate-800 overflow-hidden">
                
                {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900 sticky top-0 z-10 transition-colors">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-yellow-400 filled">star</span>
                    {roomId ? 'Starred in this Chat' : 'Starred Messages'} 
                </h2>
                <button 
                    onClick={onClose}
                    className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors text-gray-500 dark:text-gray-400"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-32 h-32 mb-4 relative">
                                <img 
                                    src="/no_starred_message.png" 
                                    alt="No starred messages" 
                                    className="w-full h-full object-contain filter drop-shadow-sm"
                                />
                                <div className="absolute inset-0 bg-violet-500/10 dark:bg-violet-400/10 blur-3xl rounded-full scale-150 -z-10" />
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 font-bold text-lg">No starred messages</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Star messages to find them here later.</p>
                        </div>
                    ) : (
                        messages.map(msg => (
                            <div 
                                key={msg.id}
                                className="group p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50 relative"
                                onClick={() => {
                                    if(onGoToMessage) {
                                        onGoToMessage(msg.room_id, msg.id);
                                        onClose();
                                    }
                                }}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                                        {msg.avatar_thumb_url ? (
                                            <img src={msg.avatar_thumb_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-xs font-bold text-slate-500">{msg.display_name?.[0]}</span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 pr-8"> {/* Added padding-right to avoid overlap with unstar button */}
                                        <div className="flex justify-between items-start">
                                            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate flex items-center gap-1">
                                                {renderTextWithEmojis(msg.display_name)}
                                                {String(msg.user_id) === String(user.id) && (
                                                    <span className="text-slate-400 dark:text-slate-500 font-normal text-xs ml-1">(You)</span>
                                                )}
                                                <span className="text-slate-400 font-normal ml-1 text-xs truncate">
                                                    in {msg.room_type === 'direct' ? 'Direct Chat' : msg.room_name} 
                                                    {/* Ideally show other user name for DM, but requires backend join */}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                            {new Date(msg.created_at).toLocaleString()}
                                        </p>
                                        
                                        <div className="mt-2 text-left">
                                            {renderMessageContent(msg)}
                                        </div>
                                    </div>
                                </div>

                                {/* Unstar Action - Fixed Round Button */}
                                <button 
                                    onClick={(e) => handleUnstar(msg.id, e)}
                                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 rounded-full opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-500 transition-all z-10 shadow-sm backdrop-blur-sm"
                                    title="Unstar"
                                >
                                    <span className="material-symbols-outlined text-[18px] filled">star</span>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

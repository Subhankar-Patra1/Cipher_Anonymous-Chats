import db from './db';
import { cryptoManager } from '../lib/crypto/CryptoManager';

/**
 * Shared message processing logic for both Dashboard (background) and ChatWindow (foreground).
 * Handles:
 * 1. Decryption (E2EE)
 * 2. Signature Verification (Coming soon)
 * 3. Reply Normalization
 */

/**
 * Decrypts a message payload if it's encrypted.
 * Uses messageId (id or tempId) for deterministic salt derivation.
 */
export const decryptPayload = async (msg) => {
    try {
        // [OPTIMIZATION] Skip if already decrypted OR not encrypted
        if (msg.isDecrypted || (msg.is_encrypted === false && msg.content)) return msg;
        if (!msg.ciphertext || !msg.iv) return msg;
        
        // Use tempId (socket), temp_id (DB), or message id for salt derivation
        const messageId = msg.tempId || msg.temp_id || msg.id;
        const roomId = msg.roomId || msg.room_id;
        const keyVersion = msg.key_version || msg.keyVersion;

        // Try to get key from cache/DB
        let roomKeyObj = await cryptoManager.getRoomKey(roomId, keyVersion);
        const roomKey = roomKeyObj?.key || roomKeyObj; // Handle both object and raw key

        // Actually decrypt
        const decryptedContent = await cryptoManager.decryptMessage(
            msg.ciphertext,
            msg.iv,
            messageId,
            roomKey,
            msg.distribution_headers,
            roomId,
            keyVersion
        );

        if (decryptedContent) {
            return {
                ...msg,
                content: decryptedContent,
                isDecrypted: true,
                is_encrypted: false // Marker for UI
            };
        }
        
        return msg; // Return as-is if decryption failed (waiting for key etc)
    } catch (err) {
        console.error('[Hydrator] Decryption failed:', err);
        return msg;
    }
};

/**
 * Helper to generate a text preview of a message (for notifications/replies)
 */
export const getMessagePreview = (msg) => {
    if (!msg) return '';
    if (msg.content) {
        const text = (msg.content.replace(/<[^>]*>/g, '') || '').trim();
        if (text) return text.length > 80 ? text.slice(0, 80) + '...' : text;
    }
    
    switch(msg.type) {
        case 'text': return 'Message';
        case 'image': return msg.caption || 'Photo';
        case 'video': return msg.caption || 'Video';
        case 'audio': return 'Voice message';
        case 'file': return msg.file_name || 'Document';
        case 'gif': return 'GIF';
        case 'sticker': return 'Sticker';
        case 'system': return msg.content;
        default: return msg.caption || 'New message';
    }
};

/**
 * Normalizes a list of messages by attaching reply context.
 * Useful for history loading and bulk processing.
 */
export const normalizeReplies = (newMsgs, existingMsgs = []) => {
    // Optimization: If no replies, return early
    if (!newMsgs.some(m => m.reply_to_message_id)) return newMsgs;

    const all = [...newMsgs, ...existingMsgs];
    const byId = new Map(all.map(m => [String(m.id), m]));
    
    return newMsgs.map(m => {
         if (!m.reply_to_message_id) return m;
         const original = byId.get(String(m.reply_to_message_id));
         if (!original) return m;

         const raw = original.content || "";
         const normalized = raw.replace(/\s+/g, " ").trim();
         const preview = normalized.length > 50 ? normalized.substring(0, 50) + "..." : normalized;

          return {
              ...m,
              replyTo: {
                  ...original,
                  text: getMessagePreview(original),
                  // [FIX] Explicitly set sender from original message's display_name/username
                  sender: original.display_name || original.username || original.sender || 'Unknown'
              }
          };
    });
};


/**
 * Orchestrator: Decrypts and normalizes a single incoming message.
 * Ready to be saved to Dexie.
 */
export const processIncomingMessage = async (msg) => {
    // [FIX] Ensure room_id is present and String for IndexedDB query alignment
    if (msg.roomId && !msg.room_id) msg.room_id = msg.roomId;
    if (msg.room_id) msg.room_id = String(msg.room_id);

    let processed = await decryptPayload(msg);
    
    // [NEW] Cache plaintext for instant sidebar/reply rendering (WhatsApp-style)
    if (processed.content && processed.isDecrypted) {
        processed.plaintext_content = processed.content;
    }
    
    // [NEW] If replyTo is already provided by server, use it directly
    if (processed.replyTo) {
        // Check if replyTo is encrypted and needs decryption
        if (processed.replyTo.ciphertext && processed.replyTo.iv) {
            try {
                const replyMsgId = processed.replyTo.temp_id || processed.replyTo.id;
                const roomId = processed.room_id;
                const keyVersion = processed.replyTo.key_version;
                
                let roomKeyObj = await cryptoManager.getRoomKey(roomId, keyVersion);
                const roomKey = roomKeyObj?.key || roomKeyObj;
                
                if (roomKey) {
                    const decryptedReplyContent = await cryptoManager.decryptMessage(
                        processed.replyTo.ciphertext,
                        processed.replyTo.iv,
                        replyMsgId,
                        roomKey,
                        null,
                        roomId,
                        keyVersion
                    );
                    
                    if (decryptedReplyContent) {
                        const preview = decryptedReplyContent.length > 80 
                            ? decryptedReplyContent.slice(0, 80) + '...' 
                            : decryptedReplyContent;
                        processed.replyTo.text = preview;
                        processed.replyTo.content = decryptedReplyContent;
                        // [NEW] Cache reply plaintext
                        processed.replyTo.plaintext_content = decryptedReplyContent;
                    }
                }
            } catch (err) {
                console.error('[Hydrator] Failed to decrypt reply:', err);
            }
        }
        
        // Use content as text fallback if text is still empty
        if (!processed.replyTo.text && processed.replyTo.content) {
            processed.replyTo.text = processed.replyTo.content.length > 80 
                ? processed.replyTo.content.slice(0, 80) + '...' 
                : processed.replyTo.content;
        }
        
        // [NEW] Also cache reply plaintext from existing content
        if (processed.replyTo.content && !processed.replyTo.plaintext_content) {
            processed.replyTo.plaintext_content = processed.replyTo.content;
        }
        
        processed.reply_to_text = processed.replyTo.text;
        processed.reply_to_user = processed.replyTo.sender;
        processed.reply_to_type = processed.replyTo.type;
    } else if (processed.reply_to_message_id) {
        // [FALLBACK] Look up parent message in local Dexie if server didn't provide replyTo
        const parent = await db.messages.where('id').equals(String(processed.reply_to_message_id)).first();
        if (parent) {
            // [UPDATED] Use cached plaintext_content if available
            const raw = parent.plaintext_content || parent.content || "";
            const normalized = raw.replace(/\s+/g, " ").trim();
            const preview = normalized.length > 50 ? normalized.substring(0, 50) + "..." : normalized;
            processed.reply_to_text = preview;
            processed.reply_to_user = parent.display_name || parent.username || "Unknown";
            processed.reply_to_type = parent.type || "text";
            
            // Also construct the replyTo object for component consumption
            processed.replyTo = {
                id: parent.id,
                sender: processed.reply_to_user,
                text: preview,
                plaintext_content: raw, // [NEW] Include cached plaintext
                type: processed.reply_to_type,
                user_id: parent.user_id
            };
        }
    }
    return processed;
};

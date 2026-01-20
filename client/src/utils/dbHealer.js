import db, { updateLocalMessage } from './db';
import { decryptPayload } from './messageHydrator';

/**
 * Database Healer - Adds plaintext_content to old messages missing it.
 * This enables instant sidebar rendering for messages saved before this feature.
 */

// Heal a single message - add plaintext_content if missing
export const healMessage = async (roomId, messageId) => {
    if (!messageId) return;
    
    const msg = await db.messages.where('id').equals(String(messageId)).first();
    if (!msg || msg.plaintext_content) return; // Already healed or not found
    
    // Only heal encrypted messages that have ciphertext
    if (msg.ciphertext && msg.iv) {
        try {
            const decrypted = await decryptPayload(msg);
            if (decrypted.content && decrypted.isDecrypted) {
                await db.messages.where('id').equals(String(messageId)).modify({
                    plaintext_content: decrypted.content,
                    isDecrypted: true
                });
                console.log('[Healer] Healed message:', messageId);
            }
        } catch (err) {
            console.warn('[Healer] Failed to heal message:', messageId, err);
        }
    } else if (msg.content && !msg.ciphertext) {
        // Non-encrypted message - just set plaintext_content to content
        await db.messages.where('id').equals(String(messageId)).modify({
            plaintext_content: msg.content
        });
    }
};

// Heal all messages in a room (background, non-blocking)
export const healRoomMessages = async (roomId) => {
    if (!roomId) return;
    
    const messages = await db.messages
        .where('room_id').equals(String(roomId))
        .filter(m => !m.plaintext_content && (m.ciphertext || m.content))
        .toArray();
    
    console.log(`[Healer] Found ${messages.length} messages to heal in room ${roomId}`);
    
    for (const msg of messages) {
        await healMessage(roomId, msg.id);
    }
};

// Export for sidebar to trigger healing when needed
export default { healMessage, healRoomMessages };

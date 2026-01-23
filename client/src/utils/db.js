import Dexie from 'dexie';

const db = new Dexie('CipherChatDB');

// Define Schema
// ++localId = Auto-incrementing integer (Internal use only)
// id = The Server ID (Index this so you can search by it)
// tempId = The Optimistic ID (Index this for your update logic)
db.version(3).stores({
  messages: '++localId, id, room_id, created_at, tempId, status', 
  keys: 'room_id',
  pending_queue: '++localId, room_id'
});

// [NEW] Version 5: Add users table for caching profiles
db.version(5).stores({
  messages: '++localId, id, room_id, created_at, tempId, status', 
  keys: 'room_id',
  pending_queue: '++localId, room_id',
  rooms: 'id',
  users: 'id' // Cache profiles: id, username, display_name, avatar_url, bio, etc.
});

// [CRITICAL] Handle "UpgradeError: Not yet support for changing primary key"
// This happens during refactoring when primary keys are modified.
db.open().catch(err => {
  if (err.name === 'UpgradeError' || err.message.includes('primary key')) {
    console.warn('[Dexie] Schema mismatch detected (primary key change). Resetting database...');
    db.delete().then(() => {
        window.location.reload();
    });
  } else {
    console.error('[Dexie] Failed to open database:', err);
  }
});

export default db;

// Helper functions for easy access

export const saveLocalUser = async (user) => {
    try {
        if (!user || !user.id) return;
        // Don't cache groups_in_common deeply or sensitive fields if not needed
        // Just cache appearance basics
        const toCache = {
            id: String(user.id),
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            avatar_thumb_url: user.avatar_thumb_url,
            bio: user.bio,
            last_seen: user.last_seen,
            cached_at: Date.now()
        };
        await db.users.put(toCache);
    } catch (err) {
        console.warn('[Dexie] Failed to cache user:', err);
    }
};

export const getLocalUser = async (userId) => {
    try {
        return await db.users.get(String(userId));
    } catch (err) {
        return null;
    }
};

export const saveLocalMessage = async (message) => {
    try {
        // Normalize IDs to String for consistent Dexie querying
        if (message.id) message.id = String(message.id);
        if (message.temp_id) message.temp_id = String(message.temp_id);
        if (message.tempId) message.tempId = String(message.tempId);
        if (message.room_id) message.room_id = String(message.room_id);

        // 1. Reconciliation by Real ID
        if (message.id && !message.id.startsWith('temp-')) {
            const existing = await db.messages.where('id').equals(message.id).first();
            if (existing) {
                // [FIX] Preserve local status if it's more authoritative than server status
                // Status priority: seen > delivered > sent > sending > pending
                const statusPriority = { 'seen': 4, 'delivered': 3, 'sent': 2, 'sending': 1, 'pending': 0 };
                const existingPriority = statusPriority[existing.status] ?? -1;
                const incomingPriority = statusPriority[message.status] ?? -1;
                
                // Keep existing status if it's higher priority (more "advanced")
                const finalStatus = existingPriority >= incomingPriority ? existing.status : message.status;
                
                await db.messages.update(existing.localId, { 
                    ...message, 
                    status: finalStatus,
                    // Also preserve plaintext_content if already cached
                    plaintext_content: message.plaintext_content || existing.plaintext_content
                });
                return existing.localId;
            }
        }

        // 2. Reconciliation by Temp ID (Confirmation of own messages)
        const tempId = message.tempId || message.temp_id;
        if (tempId) {
            const existing = await db.messages.where('tempId').equals(String(tempId)).first();
            if (existing) {
                // Merge new data into existing (confirming Real ID, content updates, etc)
                await db.messages.update(existing.localId, {
                    ...message,
                    id: message.id ? String(message.id) : existing.id
                });
                return existing.localId;
            }
        }

        // 3. Brand New Message
        return await db.messages.add(message);
    } catch (err) {
        console.error('[Dexie] Save error:', err);
        return null;
    }
};

export const updateLocalMessage = async (idOrTempId, updates) => {
    const searchId = String(idOrTempId);
    // Try tempId index first
    let count = await db.messages.where('tempId').equals(searchId).modify(updates);
    if (count === 0) {
        // Try real server id index
        count = await db.messages.where('id').equals(searchId).modify(updates);
    }
    return count;
};

export const deleteLocalMessage = async (idOrTempId) => {
    const searchId = String(idOrTempId);
    let count = await db.messages.where('tempId').equals(searchId).delete();
    if (count === 0) {
        count = await db.messages.where('id').equals(searchId).delete();
    }
    return count;
};

export const saveFetchedMessages = async (messages) => {
    for (const msg of messages) {
        await saveLocalMessage(msg);
    }
};

export const getPendingMessages = async () => {
    return await db.messages.where('status').anyOf(['sending', 'pending', 'failed']).toArray();
};

export const savePendingMessage = async (message) => {
    return await db.messages.add({ 
        ...message, 
        id: message.id ? String(message.id) : undefined,
        tempId: message.tempId ? String(message.tempId) : undefined,
        room_id: message.room_id ? String(message.room_id) : undefined,
        status: 'pending' 
    });
};

export const deletePendingMessage = async (tempId) => {
    return await db.messages.where('tempId').equals(String(tempId)).delete();
};

const db = require('../db');

/**
 * Enforces Instagram-style DM limits:
 * If a stranger starts a DM, they are limited to 1 message until the recipient accepts.
 */
async function checkMessageLimit(roomId, userId, messageType = 'text') {
    // 1. Check if room is direct
    const roomRes = await db.query('SELECT type FROM rooms WHERE id = $1', [roomId]);
    if (roomRes.rows[0]?.type !== 'direct') return; // Not a DM, no limit

    // 2. Check if the recipient has accepted the request
    // We check if there's any OTHER member who hasn't accepted yet.
    // In a DM, this will be the target user.
    const acceptedRes = await db.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id != $2 AND is_accepted = FALSE', [roomId, userId]);
    if (acceptedRes.rows.length === 0) return; // All recipients accepted or no recipient found

    // [NEW] Restrict to TEXT only for pending requests
    if (messageType !== 'text') {
        throw new Error('FORBIDDEN_TYPE');
    }

    // 3. Count messages sent by THIS user in this room
    const countRes = await db.query('SELECT COUNT(*) FROM messages WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
    const messageCount = parseInt(countRes.rows[0].count);

    if (messageCount >= 1) {
        throw new Error('LIMIT_REACHED');
    }
}

module.exports = { checkMessageLimit };

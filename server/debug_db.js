const db = require('./db');

async function test() {
    console.log("Testing DB Insert...");
    try {
        // Get a user
        const userRes = await db.query('SELECT id, username FROM users LIMIT 1');
        if (userRes.rows.length === 0) {
            console.log("No users found.");
            return;
        }
        const user = userRes.rows[0];
        console.log("User:", user);

        // Get a room for this user
        const roomRes = await db.query('SELECT room_id FROM room_members WHERE user_id = $1 LIMIT 1', [user.id]);
        if (roomRes.rows.length === 0) {
            console.log("User has no rooms.");
            return;
        }
        const roomId = roomRes.rows[0].room_id;
        console.log("Room ID:", roomId);

        // Try insert
        const audioUrl = "https://example.com/audio.webm";
        const durationMs = 1000;
        const waveform = JSON.stringify([0, 1, 0]);

        const result = await db.query(
            `INSERT INTO messages (room_id, user_id, type, audio_url, audio_duration_ms, audio_waveform, content, reply_to_message_id) 
             VALUES ($1, $2, 'audio', $3, $4, $5, 'Voice message', $6) 
             RETURNING id`,
            [roomId, user.id, audioUrl, durationMs, waveform, null]
        );
        
        console.log("Insert Success! Message ID:", result.rows[0].id);

    } catch (err) {
        console.error("DB Insert Failed:", err);
    }
}

test();

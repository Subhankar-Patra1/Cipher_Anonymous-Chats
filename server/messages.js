const express = require('express');
const db = require('./db');
const router = express.Router();
const upload = require('./upload');
const { uploadFile } = require('./s3');

// Middleware to check auth
const authenticate = (req, res, next) => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

router.use(authenticate);

router.post('/audio', upload.single('audio'), async (req, res) => {
    console.log("Received audio upload request. Body keys:", Object.keys(req.body));
    if (req.file) console.log("File received:", req.file.mimetype, req.file.size);
    else console.error("No file in request!");
    try {
        const { roomId, durationMs, waveform, replyToMessageId, tempId } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Verify room membership
        const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (!memberRes.rows[0]) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }
        const member = memberRes.rows[0];

        // Check Permissions (Send Mode)
        const permRes = await db.query('SELECT send_mode FROM group_permissions WHERE group_id = $1', [roomId]);
        const sendMode = permRes.rows[0]?.send_mode || 'everyone';

        if (sendMode === 'admins_only' && !['admin', 'owner'].includes(member.role)) {
             return res.status(403).json({ error: 'Only admins can send messages' });
        }
        if (sendMode === 'owner_only' && member.role !== 'owner') {
             return res.status(403).json({ error: 'Only owner can send messages' });
        }

        const fileName = `${roomId}/${Date.now()}-${req.user.id}.webm`;
        const audioUrl = await uploadFile(file.buffer, fileName, file.mimetype);

        // Insert into DB
        const result = await db.query(
            `INSERT INTO messages (room_id, user_id, type, audio_url, audio_duration_ms, audio_waveform, content, reply_to_message_id) 
             VALUES ($1, $2, 'audio', $3, $4, $5, 'Voice message', $6) 
             RETURNING id, status, created_at`,
            [roomId, req.user.id, audioUrl, durationMs, waveform, replyToMessageId || null]
        );
        
        const info = result.rows[0];

        // Fetch user display name
        const userRes = await db.query('SELECT display_name, avatar_thumb_url, avatar_url FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        let parsedWaveform = [];
        try {
            parsedWaveform = JSON.parse(waveform);
        } catch (e) {
            console.error("Failed to parse waveform", e);
        }

        const message = {
            id: info.id,
            room_id: roomId,
            user_id: req.user.id,
            type: 'audio',
            content: null,
            audio_url: audioUrl,
            audio_duration_ms: parseInt(durationMs),
            audio_waveform: parsedWaveform, 
            status: info.status,
            reply_to_message_id: replyToMessageId,
            created_at: info.created_at,
            username: req.user.username,
            display_name: user ? user.display_name : req.user.display_name,
            avatar_thumb_url: user ? user.avatar_thumb_url : null,
            avatar_url: user ? user.avatar_url : null,
            tempId: tempId
        };
        
        const io = req.app.get('io');
        io.to(`room:${roomId}`).emit('new_message', message);

        res.json(message);

    } catch (err) {
        console.error('Error sending voice note:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create new message (Text or GIF)
router.post('/', async (req, res) => {
    try {
        const { room_id, type = 'text', content, gif_url, preview_url, width, height, tempId, replyToMessageId } = req.body;
        
        // Basic validation
        if (!room_id) return res.status(400).json({ error: 'room_id is required' });
        
        // Verify room membership
        const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [room_id, req.user.id]);
        if (!memberRes.rows[0]) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }
        const member = memberRes.rows[0];

        // Check Permissions (Send Mode)
        const permRes = await db.query('SELECT send_mode FROM group_permissions WHERE group_id = $1', [room_id]);
        const sendMode = permRes.rows[0]?.send_mode || 'everyone';

        if (sendMode === 'admins_only' && !['admin', 'owner'].includes(member.role)) {
             return res.status(403).json({ error: 'Only admins can send messages' });
        }
        if (sendMode === 'owner_only' && member.role !== 'owner') {
             return res.status(403).json({ error: 'Only owner can send messages' });
        }

        // Check room expiry
        const roomRes = await db.query('SELECT expires_at FROM rooms WHERE id = $1', [room_id]);
        if (roomRes.rows[0]?.expires_at && new Date(roomRes.rows[0].expires_at) < new Date()) {
            return res.status(400).json({ error: 'Room expired' });
        }

        let query = '';
        let params = [];

        if (type === 'gif') {
            query = `
                INSERT INTO messages (room_id, user_id, type, content, gif_url, preview_url, width, height, reply_to_message_id)
                VALUES ($1, $2, 'gif', $3, $4, $5, $6, $7, $8)
                RETURNING id, status, reply_to_message_id, created_at
            `;
            // Content is optional for GIF, but let's store "GIF" or something if empty? Prompt says "leave content optional".
            // If DB column not null default 'text', we might need something? 
            // In migration, I added default 'text' for type, but content?
            // Existing schema likely has content NOT NULL? I should check or provide default.
            // Let's provide "GIF" as fallback content for notifications/previews if `content` is empty.
            params = [room_id, req.user.id, content || 'GIF', gif_url, preview_url, width, height, replyToMessageId || null];
        } else {
            // Fallback for text if we move text sending to REST later, though socket handles it now.
            query = `
                INSERT INTO messages (room_id, user_id, content, reply_to_message_id) 
                VALUES ($1, $2, $3, $4) 
                RETURNING id, status, reply_to_message_id, created_at
            `;
            params = [room_id, req.user.id, content, replyToMessageId || null];
        }

        const result = await db.query(query, params);
        const info = result.rows[0];

        // Unhide chat for all members
        await db.query('UPDATE room_members SET is_hidden = FALSE WHERE room_id = $1', [room_id]);

        // Fetch user info for broadcast
        const userRes = await db.query('SELECT display_name, avatar_thumb_url, avatar_url FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const message = {
            id: info.id,
            room_id,
            user_id: req.user.id,
            type: type,
            content: content || (type === 'gif' ? 'GIF' : ''),
            gif_url,
            preview_url,
            width,
            height,
            status: info.status,
            reply_to_message_id: info.reply_to_message_id,
            created_at: info.created_at,
            username: req.user.username,
            display_name: user ? user.display_name : req.user.display_name,
            avatar_thumb_url: user ? user.avatar_thumb_url : null,
            avatar_url: user ? user.avatar_url : null,
            tempId
        };

        // Broadcast
        const io = req.app.get('io');
        io.to(`room:${room_id}`).emit('new_message', message);

        res.json(message);

    } catch (err) {
        console.error('Error creating message:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete for me
router.delete('/:id/for-me', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;

    try {
        // We use array_append to add the user ID to the list
        // and distinct to avoid duplicates just in case, though array_append simply adds.
        // Postgres has array_append(anyarray, anyelement)
        // We need to handle the case where the array might be null (though we defaulted to '{}')
        
        await db.query(`
            UPDATE messages 
            SET deleted_for_user_ids = array_append(COALESCE(deleted_for_user_ids, '{}'), $1::text)
            WHERE id = $2
        `, [String(userId), messageId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting for me:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete for everyone
router.delete('/:id/for-everyone', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;

    try {
        // Verify ownership
        const msgRes = await db.query('SELECT user_id FROM messages WHERE id = $1', [messageId]);
        if (msgRes.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
        
        const message = msgRes.rows[0];
        if (message.user_id !== userId) {
            return res.status(403).json({ error: 'Not authorized to delete this message' });
        }

        // Perform delete
        await db.query(`
            UPDATE messages 
            SET is_deleted_for_everyone = TRUE
            WHERE id = $1
        `, [messageId]);

        // Emit socket event to notify all users in the room
        // We need to fetch the room_id first or return it from UPDATE
        const roomRes = await db.query('SELECT room_id FROM messages WHERE id = $1', [messageId]);
        if (roomRes.rows[0]) {
             const io = req.app.get('io');
             io.to(`room:${roomRes.rows[0].room_id}`).emit('message_deleted', { 
                 messageId,
                 is_deleted_for_everyone: true,
                 content: ""
             });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting for everyone:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark audio as heard
router.post('/:id/audio-heard', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;

    try {
        await db.query(`
            INSERT INTO audio_play_state (user_id, message_id, heard_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (user_id, message_id) DO UPDATE SET heard_at = NOW()
        `, [userId, messageId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Error marking audio as heard:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Edit message
router.put('/:id/edit', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;
    const { new_content } = req.body;

    try {
        // 1. Fetch message and verify ownership
        const msgRes = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
        if (msgRes.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
        
        const message = msgRes.rows[0];
        
        // Ownership check
        if (message.user_id !== userId) {
            return res.status(403).json({ error: 'Not authorized to edit this message' });
        }

        // Constraints check
        if (message.type !== 'text') {
             return res.status(400).json({ error: 'Only text messages can be edited' });
        }
        if (message.is_deleted_for_everyone) {
            return res.status(400).json({ error: 'Cannot edit deleted message' });
        }

        // 2. Update
        const updateRes = await db.query(`
            UPDATE messages 
            SET content = $1, edited_at = NOW(), edit_version = edit_version + 1
            WHERE id = $2
            RETURNING id, content, edited_at, edit_version, room_id, user_id, type, reply_to_message_id, created_at
        `, [new_content, messageId]);

        const updatedMsg = updateRes.rows[0];

        // 3. Broadcast
        // Need display name for the event payload consistency, though client might just patch
        // We'll send the essential update fields
        const io = req.app.get('io');
        io.to(`room:${updatedMsg.room_id}`).emit('message_edited', {
            id: updatedMsg.id,
            room_id: updatedMsg.room_id,
            content: updatedMsg.content,
            edited_at: updatedMsg.edited_at,
            edit_version: updatedMsg.edit_version
        });

        res.json(updatedMsg);

    } catch (err) {
        console.error('Error editing message:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

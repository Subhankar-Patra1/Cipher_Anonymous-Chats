const express = require('express');
const db = require('./db');
const router = express.Router();
const upload = require('./upload');
const { uploadFile, generateGetPresignedUrl, getKeyFromUrl } = require('./s3');

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
        
        // [NEW] Update Room Last Message At
        await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [roomId]);
        
        const info = result.rows[0];
        // Ensure strictly ISO string
        const createdAtISO = info.created_at;


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
            reply_to_message_id: replyToMessageId,
            created_at: createdAtISO,

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

// Send Image
router.post('/image', upload.single('image'), async (req, res) => {
    try {
        const { roomId, caption, width, height, size, tempId, replyToMessageId } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ error: 'No image file provided' });
        
        // Verify room membership
        const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (!memberRes.rows[0]) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }
        const member = memberRes.rows[0];

        // Check Permissions
        const permRes = await db.query('SELECT send_mode FROM group_permissions WHERE group_id = $1', [roomId]);
        const sendMode = permRes.rows[0]?.send_mode || 'everyone';
        if (sendMode === 'admins_only' && !['admin', 'owner'].includes(member.role)) {
             return res.status(403).json({ error: 'Only admins can send messages' });
        }
        if (sendMode === 'owner_only' && member.role !== 'owner') {
             return res.status(403).json({ error: 'Only owner can send messages' });
        }

        // Generate Filename
        const ext = file.mimetype.split('/')[1] || 'png';
        const finalFileName = `${roomId}/images/${Date.now()}-${req.user.id}.${ext}`;

        const imageUrl = await uploadFile(file.buffer, finalFileName, file.mimetype);

        // Insert into DB
        const result = await db.query(
            `INSERT INTO messages (room_id, user_id, type, image_url, image_width, image_height, image_size, content, caption, reply_to_message_id) 
             VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9) 
             RETURNING id, status, created_at`,
            [roomId, req.user.id, imageUrl, parseInt(width) || 0, parseInt(height) || 0, parseInt(size) || file.size, 'Image', caption || '', replyToMessageId || null]
        );
        
        // Update Room Last Message At
        await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [roomId]);
        
        const info = result.rows[0];
        const createdAtISO = info.created_at;

        // Fetch user display name
        const userRes = await db.query('SELECT display_name, avatar_thumb_url, avatar_url FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        let finalUrl = imageUrl;
        // [REVERTED] No proxy/signing for new messages.
        /*
        const key = getKeyFromUrl(imageUrl);
        if (key) { ... }
        */

        const message = {
            id: info.id,
            room_id: roomId,
            user_id: req.user.id,
            type: 'image',
            content: 'Image',
            caption: caption || '',
            image_url: finalUrl,
            image_width: parseInt(width || 0),
            image_height: parseInt(height || 0),
            image_size: parseInt(size || file.size),
            status: info.status,
            reply_to_message_id: replyToMessageId,
            created_at: createdAtISO,

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
        console.error('Error sending image:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create new message (Text or GIF)
router.post('/', async (req, res) => {
    try {
        const { room_id, type = 'text', content, gif_url, preview_url, width, height, tempId, replyToMessageId } = req.body;
        console.log(`[DEBUG] POST /messages hit. RoomID: ${room_id}, Type: ${type}, User: ${req.user.id}`);
        const io = req.app.get('io');
        
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
        
        // [NEW] Update Room Last Message At
        await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [room_id]);

        const info = result.rows[0];
        // Ensure strictly ISO string
        const createdAtISO = info.created_at;



        // [FIX] Explicitly find who is hidden BEFORE updating
        console.log(`[DEBUG] Handling invisible check for room ${room_id}`);
        const hiddenMembersRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1 AND is_hidden = TRUE', [room_id]);
        const hiddenUserIds = hiddenMembersRes.rows.map(r => r.user_id);
        console.log(`[DEBUG] Found hidden members in room ${room_id}:`, hiddenUserIds);
        
        // Unhide for everyone (ensure consistency)
        const updateRes = await db.query('UPDATE room_members SET is_hidden = FALSE WHERE room_id = $1', [room_id]);
        console.log(`[DEBUG] Updated room ${room_id} visibility. RowCount: ${updateRes.rowCount}`);
        
        console.log('[DEBUG] Previously hidden users:', hiddenUserIds);

        // We can also just broadcast to ALL other members to be safe, client dedups.
        // But let's prioritize the hidden ones + anyone else who might be missing it?
        // Let's stick to hidden ones first. If logic holds, they are the ones missing it.
        // If the user was NOT hidden but client missing it? (Bug state).
        // Let's effectively emit to ALL other participants to be 100% sure.
        
        const allMembersRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1', [room_id]);
        const allMemberIds = allMembersRes.rows.map(r => r.user_id); // Includes sender
        
        if (allMemberIds.length > 0) {
             // Fetch room data ONCE
             const roomQuery = await db.query('SELECT * FROM rooms WHERE id = $1', [room_id]);
             const roomData = roomQuery.rows[0];

             for (const recipientId of allMemberIds) {
                 if (recipientId == req.user.id) continue;

                 // Optimization: If they were NOT hidden, they probably have it?
                 // But user report suggests flakiness. Let's send to all. Client handles duplicates.
                 io.to(`user:${recipientId}`).emit('rooms:refresh'); // [FIX] Force refresh as fallback

                 // We need to shape the room object for THIS recipient (swapping names/avatars)
                 // Using the robust query from rooms.js + unread_count logic
                 const recipientRoomRes = await db.query(`
                    SELECT r.*, rm.role, rm.last_read_at,
                    (SELECT u.display_name FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_name,
                    (SELECT u.username FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_username,
                    (SELECT u.avatar_thumb_url FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_avatar_thumb,
                    (SELECT u.avatar_url FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_avatar_url,
                    (SELECT u.id FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_id,
                    (SELECT u.display_name FROM users u WHERE u.id = r.created_by) as creator_name,
                    (SELECT u.username FROM users u WHERE u.id = r.created_by) as creator_username,
                    (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.created_at > COALESCE(rm.last_read_at, '1970-01-01')) as unread_count,
                    gp.send_mode, gp.allow_name_change, gp.allow_description_change, gp.allow_add_members, gp.allow_remove_members
                    FROM rooms r 
                    JOIN room_members rm ON r.id = rm.room_id 
                    LEFT JOIN group_permissions gp ON r.id = gp.group_id
                    WHERE r.id = $2 AND rm.user_id = $1
                 `, [recipientId, room_id]);
                 
                 const rawRoom = recipientRoomRes.rows[0];
                 if (rawRoom) {
                     const formattedRoom = {
                        ...rawRoom,
                        name: rawRoom.type === 'direct' ? (rawRoom.other_user_name || 'Unknown User') : rawRoom.name,
                        username: rawRoom.type === 'direct' ? rawRoom.other_user_username : null,
                        other_user_id: rawRoom.type === 'direct' ? rawRoom.other_user_id : null,
                        avatar_thumb_url: rawRoom.type === 'direct' ? rawRoom.other_user_avatar_thumb : rawRoom.avatar_thumb_url,
                        avatar_url: rawRoom.type === 'direct' ? rawRoom.other_user_avatar_url : rawRoom.avatar_url,
                        creator_name: rawRoom.creator_name,
                        creator_username: rawRoom.creator_username,
                        unread_count: parseInt(rawRoom.unread_count || 0) // Ensure number
                     };
                     
                     io.to(`user:${recipientId}`).emit('room_added', formattedRoom);
                 } else {
                     // console.log(`[DEBUG] Failed to fetch rawRoom for user:${recipientId} room:${room_id}`);
                 }
             }
         }

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
            reply_to_message_id: info.reply_to_message_id,
            created_at: createdAtISO,

            username: req.user.username,
            display_name: user ? user.display_name : req.user.display_name,
            avatar_thumb_url: user ? user.avatar_thumb_url : null,
            avatar_url: user ? user.avatar_url : null,
            tempId
        };

        // Broadcast
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
        if (message.type !== 'text' && message.type !== 'image') {
             return res.status(400).json({ error: 'Only text and image messages can be edited' });
        }
        if (message.is_deleted_for_everyone) {
            return res.status(400).json({ error: 'Cannot edit deleted message' });
        }

        // 2. Update
        let updateRes;
        if (message.type === 'image') {
            updateRes = await db.query(`
                UPDATE messages 
                SET caption = $1, content = $1, edited_at = NOW(), edit_version = edit_version + 1
                WHERE id = $2
                RETURNING id, content, caption, edited_at, edit_version, room_id, user_id, type, reply_to_message_id, created_at
            `, [new_content, messageId]);
        } else {
            updateRes = await db.query(`
                UPDATE messages 
                SET content = $1, edited_at = NOW(), edit_version = edit_version + 1
                WHERE id = $2
                RETURNING id, content, caption, edited_at, edit_version, room_id, user_id, type, reply_to_message_id, created_at
            `, [new_content, messageId]);
        }

        const updatedMsg = updateRes.rows[0];

        // 3. Broadcast
        // Need display name for the event payload consistency, though client might just patch
        // We'll send the essential update fields
        const io = req.app.get('io');
        io.to(`room:${updatedMsg.room_id}`).emit('message_edited', {
            id: updatedMsg.id,
            room_id: updatedMsg.room_id,
            content: updatedMsg.content,
            caption: updatedMsg.caption, // [NEW] Include caption
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

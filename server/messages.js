const express = require('express');
const db = require('./db');
const router = express.Router();
const upload = require('./upload');
const { uploadFile, generateGetPresignedUrl, getKeyFromUrl } = require('./s3');

// Middleware to check auth
const authenticate = (req, res, next) => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
    
    let token = req.headers.authorization?.split(' ')[1];
    
    // [FIX] Allow token in query for direct downloads/streams
    if (!token && req.query.token) {
        token = req.query.token;
    }

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

        // [MODIFIED] Check Block Status for Direct Chats (set flag instead of reject)
        let isBlocked = false;
        let blockerUserId = null; // [NEW] Track who blocked whom
        const roomTypeRes = await db.query('SELECT type FROM rooms WHERE id = $1', [roomId]);
        if (roomTypeRes.rows[0]?.type === 'direct') {
             const otherMemberRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1 AND user_id != $2', [roomId, req.user.id]);
             const otherUserId = otherMemberRes.rows[0]?.user_id;
             if (otherUserId) {
                 const blockCheck = await db.query(
                     'SELECT blocker_id FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
                     [req.user.id, otherUserId]
                 );
                 if (blockCheck.rows.length > 0) {
                     isBlocked = true;
                     // Identify who is the blocker - they should never see this message
                     blockerUserId = parseInt(blockCheck.rows[0].blocker_id, 10);
                 }
             }
        }

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

        // Insert into DB (always save, even if blocked)
        // [MODIFIED] Include blocked_for_user_id to permanently hide from blocker
        const result = await db.query(
            `INSERT INTO messages (room_id, user_id, type, audio_url, audio_duration_ms, audio_waveform, content, reply_to_message_id, blocked_for_user_id) 
             VALUES ($1, $2, 'audio', $3, $4, $5, 'Voice message', $6, $7) 
             RETURNING id, status, created_at`,
            [roomId, req.user.id, audioUrl, durationMs, waveform, replyToMessageId || null, blockerUserId || null]
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
        
        // [MODIFIED] If blocked, only emit to sender (not broadcast to room)
        if (isBlocked) {
            io.to(`user:${req.user.id}`).emit('new_message', message);
        } else {
            io.to(`room:${roomId}`).emit('new_message', message);
        }

        res.json(message);

    } catch (err) {
        console.error('Error sending voice note:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send Image
// Send Image (Multiple)
router.post('/image', upload.array('images', 10), async (req, res) => {
    try {
        const { roomId, caption, size, tempId, replyToMessageId, isViewOnce } = req.body;
        // width/height might come as arrays or single values depending on implementation. 
        // For simplicity, let's assume we calculate dimensions on server or client sends JSON metadata.
        // Client plan: Client sends files. Client also needs to send metadata? 
        // `req.body` with `upload.array` will have text fields. If multiple valid, they are arrays?
        // Let's rely on extracting from file or just fallback for now. 
        // Better: client sends `widths` and `heights` as JSON strings or arrays.
        
        let files = req.files;
        // Fallback for single file upload compatibility if client hasn't updated
        if (!files || files.length === 0) {
            if (req.file) files = [req.file]; // Should not happen with upload.array but just in case of mixed middleware use
        }

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No image files provided' });
        }
        
        console.log('[DEBUG] Upload Image Body:', JSON.stringify(req.body, null, 2));
        console.log('[DEBUG] Files received:', files.length);

        // Verify room membership
        const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (!memberRes.rows[0]) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }
        const member = memberRes.rows[0];

        // [MODIFIED] Check Block Status for Direct Chats (set flag instead of reject)
        let isBlocked = false;
        let blockerUserId = null;
        const roomTypeRes = await db.query('SELECT type FROM rooms WHERE id = $1', [roomId]);
        if (roomTypeRes.rows[0]?.type === 'direct') {
             const otherMemberRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1 AND user_id != $2', [roomId, req.user.id]);
             const otherUserId = otherMemberRes.rows[0]?.user_id;
             if (otherUserId) {
                 const blockCheck = await db.query(
                     'SELECT blocker_id FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
                     [req.user.id, otherUserId]
                 );
                 if (blockCheck.rows.length > 0) {
                     isBlocked = true;
                     blockerUserId = parseInt(blockCheck.rows[0].blocker_id, 10);
                 }
             }
        }

        // Check Permissions
        const permRes = await db.query('SELECT send_mode FROM group_permissions WHERE group_id = $1', [roomId]);
        const sendMode = permRes.rows[0]?.send_mode || 'everyone';
        if (sendMode === 'admins_only' && !['admin', 'owner'].includes(member.role)) {
             return res.status(403).json({ error: 'Only admins can send messages' });
        }
        if (sendMode === 'owner_only' && member.role !== 'owner') {
             return res.status(403).json({ error: 'Only owner can send messages' });
        }

        // Generate Filenames & Upload
        const attachments = [];
        const configWidths = req.body.widths ? (Array.isArray(req.body.widths) ? req.body.widths : [req.body.widths]) : [];
        const configHeights = req.body.heights ? (Array.isArray(req.body.heights) ? req.body.heights : [req.body.heights]) : [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const ext = file.mimetype.split('/')[1] || 'png';
            const finalFileName = `${roomId}/images/${Date.now()}-${req.user.id}-${i}.${ext}`;
            
            const imageUrl = await uploadFile(file.buffer, finalFileName, file.mimetype);
            
            attachments.push({
                url: imageUrl,
                width: parseInt(configWidths[i] || 0),
                height: parseInt(configHeights[i] || 0),
                size: file.size,
                type: 'image'
            });
        }
        
        // For backward compatibility, use the first image for top-level columns
        const primaryImage = attachments[0];

        // Insert into DB with blocked_for_user_id
        const result = await db.query(
            `INSERT INTO messages (room_id, user_id, type, image_url, image_width, image_height, image_size, content, caption, reply_to_message_id, attachments, is_view_once, blocked_for_user_id) 
             VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
             RETURNING id, status, created_at`,
            [roomId, req.user.id, primaryImage.url, primaryImage.width, primaryImage.height, primaryImage.size, 'Image', caption || '', replyToMessageId || null, JSON.stringify(attachments), isViewOnce === 'true' || isViewOnce === true, blockerUserId || null]
        );
        
        // Update Room Last Message At
        await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [roomId]);
        
        const info = result.rows[0];
        const createdAtISO = info.created_at;

        // Fetch user display name
        const userRes = await db.query('SELECT display_name, avatar_thumb_url, avatar_url FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const message = {
            id: info.id,
            room_id: roomId,
            user_id: req.user.id,
            type: 'image',
            content: 'Image',
            caption: caption || '',
            image_url: primaryImage.url,
            image_width: primaryImage.width,
            image_height: primaryImage.height,
            image_size: primaryImage.size,
            attachments: attachments,
            status: info.status,
            reply_to_message_id: replyToMessageId,
            created_at: createdAtISO,
            username: req.user.username,
            display_name: user ? user.display_name : req.user.display_name,
            avatar_thumb_url: user ? user.avatar_thumb_url : null,
            avatar_url: user ? user.avatar_url : null,
            tempId: tempId,
            is_view_once: isViewOnce === 'true' || isViewOnce === true,
            viewed_by: []
        };
        
        const io = req.app.get('io');
        
        // [MODIFIED] If blocked, only emit to sender
        if (isBlocked) {
            io.to(`user:${req.user.id}`).emit('new_message', message);
        } else {
            io.to(`room:${roomId}`).emit('new_message', message);
        }

        res.json(message);

    } catch (err) {
        console.error('Error sending image:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send Generic File
router.post('/file', upload.single('file'), async (req, res) => {
    try {
        const { roomId, tempId, replyToMessageId, caption } = req.body; // [MODIFIED] Added caption
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        console.log('[DEBUG] Upload File Body:', JSON.stringify(req.body, null, 2));

        // Verify room membership
        const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (!memberRes.rows[0]) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }
        const member = memberRes.rows[0];

        // [MODIFIED] Check Block Status for Direct Chats (set flag instead of reject)
        let isBlocked = false;
        let blockerUserId = null;
        const roomTypeRes = await db.query('SELECT type FROM rooms WHERE id = $1', [roomId]);
        if (roomTypeRes.rows[0]?.type === 'direct') {
             const otherMemberRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1 AND user_id != $2', [roomId, req.user.id]);
             const otherUserId = otherMemberRes.rows[0]?.user_id;
             if (otherUserId) {
                 const blockCheck = await db.query(
                     'SELECT blocker_id FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
                     [req.user.id, otherUserId]
                 );
                 if (blockCheck.rows.length > 0) {
                     isBlocked = true;
                     blockerUserId = parseInt(blockCheck.rows[0].blocker_id, 10);
                 }
             }
        }

        // Check Permissions
        const permRes = await db.query('SELECT send_mode FROM group_permissions WHERE group_id = $1', [roomId]);
        const sendMode = permRes.rows[0]?.send_mode || 'everyone';
        if (sendMode === 'admins_only' && !['admin', 'owner'].includes(member.role)) {
             return res.status(403).json({ error: 'Only admins can send messages' });
        }
        if (sendMode === 'owner_only' && member.role !== 'owner') {
             return res.status(403).json({ error: 'Only owner can send messages' });
        }

        // Generate Filename & Upload
        // Preserve original extension or infer from mimetype? 
        // User wants "Extract extension".
        const originalName = file.originalname;
        const ext = originalName.split('.').pop();
        const finalFileName = `${roomId}/files/${Date.now()}-${req.user.id}-${originalName}`;
        
        const fileUrl = await uploadFile(file.buffer, finalFileName, file.mimetype, `attachment; filename="${originalName}"`);
        
        const fileSize = file.size;
        const mimeType = file.mimetype;

        // Insert into DB with blocked_for_user_id
        const result = await db.query(
            `INSERT INTO messages (room_id, user_id, type, file_url, file_name, file_size, file_type, file_extension, content, caption, reply_to_message_id, blocked_for_user_id) 
             VALUES ($1, $2, 'file', $3, $4, $5, $6, $7, $8, $9, $10, $11) 
             RETURNING id, status, created_at`,
            [roomId, req.user.id, fileUrl, originalName, fileSize, mimeType, ext, 'File', caption || null, replyToMessageId || null, blockerUserId || null]
        );
        
        // Update Room Last Message At
        await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [roomId]);
        
        const info = result.rows[0];
        const createdAtISO = info.created_at;

        // Fetch user display name
        const userRes = await db.query('SELECT display_name, avatar_thumb_url, avatar_url FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const message = {
            id: info.id,
            room_id: roomId,
            user_id: req.user.id,
            type: 'file',
            content: 'File',
            file_url: fileUrl,
            file_name: originalName,
            file_size: fileSize,
            file_type: mimeType,
            file_extension: ext,
            status: info.status,
            reply_to_message_id: replyToMessageId,
            created_at: createdAtISO,
            username: req.user.username,
            display_name: user ? user.display_name : req.user.display_name,
            avatar_thumb_url: user ? user.avatar_thumb_url : null,
            avatar_url: user ? user.avatar_url : null,
            caption: caption || null, // [FIX] Include caption in emission
            tempId: tempId
        };
        
        const io = req.app.get('io');
        
        // [MODIFIED] If blocked, only emit to sender
        if (isBlocked) {
            io.to(`user:${req.user.id}`).emit('new_message', message);
        } else {
            io.to(`room:${roomId}`).emit('new_message', message);
        }

        res.json(message);

    } catch (err) {
        console.error('Error sending file:', err);
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

        // [MODIFIED] Check Block Status for Direct Chats (set flag instead of reject)
        let isBlocked = false;
        let blockerUserId = null;
        const roomTypeRes = await db.query('SELECT type FROM rooms WHERE id = $1', [room_id]);
        if (roomTypeRes.rows[0]?.type === 'direct') {
             const otherMemberRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1 AND user_id != $2', [room_id, req.user.id]);
             const otherUserId = otherMemberRes.rows[0]?.user_id;
             if (otherUserId) {
                 const blockCheck = await db.query(
                     'SELECT blocker_id FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
                     [req.user.id, otherUserId]
                 );
                 if (blockCheck.rows.length > 0) {
                     isBlocked = true;
                     blockerUserId = parseInt(blockCheck.rows[0].blocker_id, 10);
                 }
             }
        }

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

        // Build insert query based on type - include blocked_for_user_id
        let query;
        let params;
        if (type === 'gif') {
            query = `
                INSERT INTO messages (room_id, user_id, type, gif_url, preview_url, width, height, content, reply_to_message_id, blocked_for_user_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                RETURNING id, status, reply_to_message_id, created_at
            `;
            params = [room_id, req.user.id, type, gif_url, preview_url, width, height, content || 'GIF', replyToMessageId || null, blockerUserId || null];
        } else if (type === 'location') {
            const { latitude, longitude, address } = req.body;
            query = `
                INSERT INTO messages (room_id, user_id, type, content, latitude, longitude, address, reply_to_message_id, blocked_for_user_id) 
                VALUES ($1, $2, 'location', $3, $4, $5, $6, $7, $8) 
                RETURNING id, status, reply_to_message_id, created_at
            `;
            params = [room_id, req.user.id, address || 'Location', latitude, longitude, address || null, replyToMessageId || null, blockerUserId || null];
        } else {
            // Fallback for text
            query = `
                INSERT INTO messages (room_id, user_id, content, reply_to_message_id, blocked_for_user_id) 
                VALUES ($1, $2, $3, $4, $5) 
                RETURNING id, status, reply_to_message_id, created_at
            `;
            params = [room_id, req.user.id, content, replyToMessageId || null, blockerUserId || null];
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
            content: content || (type === 'gif' ? 'GIF' : type === 'location' ? (req.body.address || 'Location') : ''),
            gif_url,
            preview_url,
            width,
            height,
            // [NEW] Location fields
            latitude: req.body.latitude || null,
            longitude: req.body.longitude || null,
            address: req.body.address || null,
            status: info.status,
            reply_to_message_id: info.reply_to_message_id,
            created_at: createdAtISO,

            username: req.user.username,
            display_name: user ? user.display_name : req.user.display_name,
            avatar_thumb_url: user ? user.avatar_thumb_url : null,
            avatar_url: user ? user.avatar_url : null,
            tempId
        };

        // [MODIFIED] Broadcast - If blocked, only emit to sender
        if (isBlocked) {
            io.to(`user:${req.user.id}`).emit('new_message', message);
        } else {
            io.to(`room:${room_id}`).emit('new_message', message);
        }

        res.json(message);

    } catch (err) {
        console.error('Error creating message:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// [NEW] Message Info
router.get('/:id/info', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;

    try {
        // 1. Fetch Message & Basic Checks
        // We need message details + room_id to check permissions
        const messageRes = await db.query(`
            SELECT m.*, r.type as room_type 
            FROM messages m
            JOIN rooms r ON m.room_id = r.id
            WHERE m.id = $1
        `, [messageId]);

        if (messageRes.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }

        const msg = messageRes.rows[0];

        // 2. Permission Checks
        if (msg.is_deleted_for_everyone) {
            return res.status(403).json({ error: 'Message info not available for deleted messages' });
        }
        
        const memberRes = await db.query('SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2', [msg.room_id, userId]);
        if (!memberRes.rows[0]) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }

        if (msg.room_type === 'direct' && msg.user_id !== userId) {
            return res.status(403).json({ error: 'Message info is only available to the sender in direct chats' });
        }

        // 3. Fetch Room Members
        const membersRes = await db.query(`
            SELECT rm.user_id, rm.last_read_at, u.display_name, u.username, u.avatar_thumb_url
            FROM room_members rm
            JOIN users u ON rm.user_id = u.id
            WHERE rm.room_id = $1
        `, [msg.room_id]);

        const membersMap = {};
        membersRes.rows.forEach(m => {
            membersMap[m.user_id] = m;
        });

        // 4. Fetch Semantic Interactions (Played, Opened) from New Table
        const interactionsRes = await db.query(`
            SELECT user_id, interaction_type, created_at 
            FROM message_interactions 
            WHERE message_id = $1
        `, [messageId]);

        // Buckets
        const playedBy = [];
        const openedBy = [];

        interactionsRes.rows.forEach(row => {
            const member = membersMap[row.user_id];
            if (!member || row.user_id === msg.user_id) return; // Skip self interactions if stored

            const entry = {
                userId: row.user_id,
                name: member.display_name || member.username,
                avatar: member.avatar_thumb_url,
                at: row.created_at
            };

            if (row.interaction_type === 'played') playedBy.push(entry);
            if (row.interaction_type === 'opened') openedBy.push(entry);
        });

        // 5. Compute Read (Existing Logic)
        const readBy = [];
        const dbReadBy = msg.read_by || [];
        [...new Set(dbReadBy)].forEach(uid => {
            if (uid === msg.user_id) return; 
            const member = membersMap[uid];
            if (member) {
                readBy.push({
                    userId: uid,
                    name: member.display_name || member.username,
                    avatar: member.avatar_thumb_url,
                    at: member.last_read_at, 
                    approximate: true
                });
            }
        });

        // [NEW] Delivered To (from message_deliveries table - Source of Truth)
        const deliveriesRes = await db.query(`
            SELECT user_id, delivered_at
            FROM message_deliveries
            WHERE message_id = $1
        `, [messageId]);

        const deliveredTo = [];
        const deliveredUserIds = new Set();
        
        deliveriesRes.rows.forEach(row => {
            if (row.user_id === msg.user_id) return; // Should not happen but safe guard
            const member = membersMap[row.user_id];
            // Even if member left, we show they got it? For now only show if in mapping.
            if (member) {
                deliveredTo.push({
                    userId: row.user_id,
                    name: member.display_name || member.username,
                    avatar: member.avatar_thumb_url,
                    at: row.delivered_at
                });
                deliveredUserIds.add(row.user_id);
            }
        });

        // [NEW] Pending (Everyone in room - sender - delivered)
        const pending = [];
        Object.values(membersMap).forEach(member => {
            if (member.user_id === msg.user_id) return; // Sender
            if (!deliveredUserIds.has(member.user_id)) {
                pending.push({
                    userId: member.user_id,
                    name: member.display_name || member.username,
                    avatar: member.avatar_thumb_url
                });
            }
        });


        // 6. Response
        res.json({
            message: {
                id: msg.id,
                type: msg.type,
                content: msg.content,
                caption: msg.caption,
                created_at: msg.created_at,
                media_url: msg.image_url || msg.file_url || msg.audio_url || msg.gif_url,
                file_name: msg.file_name,
                file_size: msg.file_size,
                audio_duration_ms: msg.audio_duration_ms,
                is_view_once: msg.is_view_once
            },
            interactions: {
                read: readBy,
                played: playedBy,
                opened: openedBy
            },
            delivered: deliveredTo,
            pending: pending,
            isGroup: msg.room_type === 'group'
        });

    } catch (err) {
        console.error('Error fetching message info:', err);
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

        const io = req.app.get('io');
        // Force client to refresh rooms list to update last message preview
        io.to(`user:${userId}`).emit('rooms:refresh');

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
                 content: "",
                 roomId: roomRes.rows[0].room_id // [NEW] Include roomId for client cache updates
             });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting for everyone:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark audio as heard (Played)
router.post('/:id/audio-heard', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;

    try {
        // [MODIFIED] Use message_interactions
        await db.query(`
            INSERT INTO message_interactions (message_id, user_id, interaction_type)
            VALUES ($1, $2, 'played')
            ON CONFLICT (message_id, user_id, interaction_type) DO UPDATE SET created_at = NOW()
        `, [messageId, userId]);

        // [NEW] Ensure delivery is recorded if played
        await db.query(`
            INSERT INTO message_deliveries (message_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT (message_id, user_id) DO NOTHING
        `, [messageId, userId]);
        
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

// Proxy Download
router.get('/proxy-download', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const axios = require('axios');
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });

        // Set headers
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Content-Disposition', `attachment; filename="download.${response.headers['content-type'].split('/')[1] || 'bin'}"`);

        response.data.pipe(res);
    } catch (err) {
        console.error('Proxy download error:', err);
        res.status(500).json({ error: 'Download failed' });
    }
});

// View Once - Get Image
router.get('/:id/view-once', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;

    try {
        const result = await db.query(`
            SELECT m.*, 
            (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = m.room_id) as room_member_count
            FROM messages m WHERE m.id = $1
        `, [messageId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });

        const message = result.rows[0];

        if (!message.is_view_once) {
            return res.status(400).json({ error: 'Not a view-once message' });
        }

        // Check if user already viewed
        if (message.viewed_by && message.viewed_by.includes(userId)) {
             return res.status(403).json({ error: 'Photo expired' });
        }

        // Mark as viewed with timestamp (Existing logic + New Table)
        const now = new Date().toISOString();
        await db.query(`
            UPDATE messages 
            SET viewed_by = array_append(COALESCE(viewed_by, '{}'), $1),
                viewed_at = COALESCE(viewed_at, '{}')::jsonb || jsonb_build_object($1::text, $3::text)
            WHERE id = $2
        `, [userId, messageId, now]);

        // [NEW] Insert into message_interactions
        await db.query(`
            INSERT INTO message_interactions (message_id, user_id, interaction_type)
            VALUES ($1, $2, 'opened')
            ON CONFLICT (message_id, user_id, interaction_type) DO NOTHING
        `, [messageId, userId]);

        // [NEW] Ensure delivery is recorded if opened
        await db.query(`
            INSERT INTO message_deliveries (message_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT (message_id, user_id) DO NOTHING
        `, [messageId, userId]);
        
        // Notify room
        const io = req.app.get('io');
        const updatedViewedBy = [...(message.viewed_by || []), userId];
        const eventData = {
            id: messageId,
            room_id: message.room_id,
            userId: userId,
            viewed_by: updatedViewedBy,
            room_member_count: parseInt(message.room_member_count || 0)
        };
        console.log(`[DEBUG] Emitting message_viewed for msg ${messageId} to room:${message.room_id}`, eventData);
        
        // Emit to room (ensure string logic matches join)
        io.to(`room:${message.room_id}`).emit('message_viewed', eventData);
        
        // Also emit to the sender specifically if possible (safety net)
        if (message.user_id) {
             console.log(`[DEBUG] Also emitting to user:${message.user_id}`);
             io.to(`user:${message.user_id}`).emit('message_viewed', eventData);
        }

        // Stream image
        const axios = require('axios');
        const response = await axios({
            method: 'get',
            url: message.image_url,
            responseType: 'stream'
        });

        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);

    } catch (err) {
        console.error('Error fetching view once:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// =====================
// PINNED MESSAGES ROUTES
// =====================

// Pin a message
router.post('/:id/pin', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;
    const { durationHours = 168 } = req.body; // Default 7 days

    try {
        // Get message and verify it exists
        const msgRes = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
        if (msgRes.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const message = msgRes.rows[0];

        // Verify user is member of the room
        const memberRes = await db.query(
            'SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2', 
            [message.room_id, userId]
        );
        if (memberRes.rows.length === 0) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }

        // Check if already pinned
        if (message.is_pinned) {
            return res.status(400).json({ error: 'Message is already pinned' });
        }

        // Calculate expiration
        const pinExpiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

        // Pin the message
        await db.query(`
            UPDATE messages 
            SET is_pinned = TRUE, pinned_by = $1, pinned_at = NOW(), pin_expires_at = $3
            WHERE id = $2
        `, [userId, messageId, pinExpiresAt]);

        // Get pinner info
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [userId]);
        const pinnerName = userRes.rows[0]?.display_name || 'Someone';

        // Create system message for pin action
        const systemMsgRes = await db.query(`
            INSERT INTO messages (room_id, user_id, type, content)
            VALUES ($1, $2, 'system', $3)
            RETURNING id, created_at
        `, [message.room_id, userId, `pinned a message`]);
        
        const systemMsg = {
            id: systemMsgRes.rows[0].id,
            room_id: message.room_id,
            user_id: userId,
            type: 'system',
            content: 'pinned a message',
            created_at: systemMsgRes.rows[0].created_at,
            display_name: pinnerName
        };

        // Broadcast to room
        const io = req.app.get('io');
        io.to(`room:${message.room_id}`).emit('new_message', systemMsg);
        io.to(`room:${message.room_id}`).emit('message_pinned', {
            messageId: message.id,
            roomId: message.room_id,
            pinnedBy: userId,
            pinnedByName: pinnerName,
            pinnedAt: new Date().toISOString(),
            pinExpiresAt: pinExpiresAt.toISOString()
        });

        res.json({ success: true, messageId, pinExpiresAt: pinExpiresAt.toISOString() });

    } catch (err) {
        console.error('Error pinning message:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Unpin a message
router.delete('/:id/pin', async (req, res) => {
    const messageId = req.params.id;
    const userId = req.user.id;

    try {
        // Get message
        const msgRes = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
        if (msgRes.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const message = msgRes.rows[0];

        // Verify user is member
        const memberRes = await db.query(
            'SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2', 
            [message.room_id, userId]
        );
        if (memberRes.rows.length === 0) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }

        // Check if pinned
        if (!message.is_pinned) {
            return res.status(400).json({ error: 'Message is not pinned' });
        }

        // Unpin the message
        await db.query(`
            UPDATE messages 
            SET is_pinned = FALSE, pinned_by = NULL, pinned_at = NULL
            WHERE id = $1
        `, [messageId]);

        // Broadcast to room
        const io = req.app.get('io');
        io.to(`room:${message.room_id}`).emit('message_unpinned', {
            messageId: message.id,
            roomId: message.room_id
        });

        // [FIX] Cleanup: If the LAST message in the room was "X pinned a message", delete it
        // This fixes the sidebar preview showing "You pinned a message" even after unpinning
        const lastMsgRes = await db.query(
            'SELECT id, type, content FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1',
            [message.room_id]
        );
        
        if (lastMsgRes.rows.length > 0) {
            const lastMsg = lastMsgRes.rows[0];
            if (lastMsg.type === 'system' && lastMsg.content.includes('pinned a message')) {
                await db.query('DELETE FROM messages WHERE id = $1', [lastMsg.id]);
                
                // Notify sidebar to refresh for everyone in the room to update preview
                const roomMembers = await db.query('SELECT user_id FROM room_members WHERE room_id = $1', [message.room_id]);
                roomMembers.rows.forEach(member => {
                    io.to(`user:${member.user_id}`).emit('rooms:refresh');
                });
                
                // Also remove it from the chat view
                io.to(`room:${message.room_id}`).emit('message_deleted', { 
                    messageId: lastMsg.id,
                    is_deleted_for_everyone: true, // Treated as hard delete effectively for system msg? Or just remove it.
                    // Actually, for system message hard delete is fine.
                    // Usage of message_deleted usually implies TOMBSTONE ("This message was deleted").
                    // For system messages, we probably just want it GONE.
                    // Client usually removes it if it receives a delete event? 
                    // Let's verify client handling. 
                    // If is_deleted_for_everyone=true, client renders "This message was deleted". 
                    // We don't want a tombstone for a system message.
                    // But we don't have a "hard_delete" event. 
                    // 'chat:cleared' is strictly for clear history.
                    // 'message_deleted' is the standard. 
                    // If we pass a flag 'hardDelete: true'? Client might not support it.
                    // Let's look at client logic. 
                    // Client: `setMessages(prev => prev.filter(m => m.id !== messageId))` ?
                    // Or `prev.map(m => m.id === messageId ? { ...m, is_deleted_for_everyone: true } : m)`
                    // Standard deletion updates the UI to show "Deleted".
                    // However, for this specific UX improvement, showing "This message was deleted" instead of "Pinned" is arguably uglier.
                    // But usually these system messages are transient notifications.
                    // Let's stick to just 'rooms:refresh' for sidebar correctness. 
                    // The chat list usually appends. If we delete it from DB, a full refresh/re-fetch removes it.
                    // But for live users, it might stay until refresh.
                    // Let's use `message_deleted` but maybe we can filter system messages in client? 
                    // Or simply ACCEPT that it shows "This message was deleted" for a moment? 
                    // Actually, if I just hard delete in DB, and don't emit message_deleted, it stays in UI until refresh.
                    // That's acceptable for now, primary goal is Sidebar.
                    // Wait, if I emit `message_deleted`, the sidebar update via `rooms:refresh` might race.
                    // Let's emit `rooms:refresh` which solves the main bug. 
                    // And let's emit a `message_deleted` with a custom property or just standard.
                    roomId: message.room_id 
                });
            }
        }

        res.json({ success: true, messageId });

    } catch (err) {
        console.error('Error unpinning message:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all pinned messages for a room
router.get('/room/:roomId/pinned', async (req, res) => {
    const roomId = req.params.roomId;
    const userId = req.user.id;

    try {
        // Verify user is member
        const memberRes = await db.query(
            'SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', 
            [roomId, userId]
        );
        if (memberRes.rows.length === 0) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }

        // Get pinned messages with user info
        const result = await db.query(`
            SELECT m.*, 
                   u.display_name, u.username, u.avatar_thumb_url, u.avatar_url,
                   pinner.display_name as pinned_by_name
            FROM messages m
            JOIN users u ON m.user_id = u.id
            LEFT JOIN users pinner ON m.pinned_by = pinner.id
            WHERE m.room_id = $1 
              AND m.is_pinned = TRUE 
              AND m.is_deleted_for_everyone = FALSE
            ORDER BY m.pinned_at DESC
        `, [roomId]);

        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching pinned messages:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

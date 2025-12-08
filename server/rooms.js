const express = require('express');
const db = require('./db');
const crypto = require('crypto');

const router = express.Router();

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

// Create Room
router.post('/', async (req, res) => {
    const { name, type, targetUserId } = req.body; // type: 'group' or 'direct'
    
    if (!type) return res.status(400).json({ error: 'Type required' });

    // Handle Direct Message Room
    if (type === 'direct') {
        if (!targetUserId) return res.status(400).json({ error: 'Target user required for DM' });

        try {
            // Fetch users to get display names and usernames
            const targetUserRes = await db.query('SELECT display_name, username FROM users WHERE id = $1', [targetUserId]);
            const targetUser = targetUserRes.rows[0];
            
            const creatorRes = await db.query('SELECT display_name, username FROM users WHERE id = $1', [req.user.id]);
            const creator = creatorRes.rows[0];

            if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

            // Check if DM already exists
            const checkRes = await db.query(`
                SELECT r.* FROM rooms r
                JOIN room_members rm1 ON r.id = rm1.room_id
                JOIN room_members rm2 ON r.id = rm2.room_id
                WHERE r.type = 'direct' 
                AND rm1.user_id = $1 
                AND rm2.user_id = $2
            `, [req.user.id, targetUserId]);
            
            const existingRoom = checkRes.rows[0];

            if (existingRoom) {
                return res.json({ 
                    ...existingRoom, 
                    name: targetUser.display_name,
                    username: targetUser.username
                });
            }

            // Create new DM room
            const insertRoomRes = await db.query('INSERT INTO rooms (type, created_by) VALUES ($1, $2) RETURNING id', ['direct', req.user.id]);
            const roomId = insertRoomRes.rows[0].id;

            // Add both users
            await db.query('INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3)', [roomId, req.user.id, 'owner']);
            await db.query('INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3)', [roomId, targetUserId, 'member']);

            // Fetch created room
            const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
            const room = roomRes.rows[0];
            
            // Prepare response for creator
            const roomForCreator = { 
                ...room, 
                name: targetUser.display_name,
                username: targetUser.username
            };
            
            // Prepare payload for target user
            const roomForTarget = { 
                ...room, 
                name: creator.display_name,
                username: creator.username
            };

            // Emit event to target user
            const io = req.app.get('io');
            io.to(`user:${targetUserId}`).emit('room_added', roomForTarget);

            res.json(roomForCreator);

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Server error' });
        }
        return;
    }

    // Handle Group Room
    let code = null;
    let expiresAt = null;

    if (type === 'group') {
        code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
        expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h
    }

    try {
        const insertRes = await db.query(
            'INSERT INTO rooms (name, type, code, created_by, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name || null, type, code, req.user.id, expiresAt]
        );
        const roomId = insertRes.rows[0].id;
        
        // Add creator as member
        await db.query('INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3)', [roomId, req.user.id, 'owner']);

        res.json({ id: roomId, code, name, type, expires_at: expiresAt });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Join Room
router.post('/join', async (req, res) => {
    const { code } = req.body;
    
    if (!code) return res.status(400).json({ error: 'Code required' });

    try {
        const roomRes = await db.query('SELECT * FROM rooms WHERE code = $1', [code]);
        const room = roomRes.rows[0];

        if (!room) return res.status(404).json({ error: 'Room not found' });
        
        if (room.expires_at && new Date(room.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Room expired' });
        }

        // Check if already member
        const memberCheck = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, req.user.id]);
        if (memberCheck.rows.length > 0) {
            return res.json({ message: 'Already joined', roomId: room.id });
        }

        await db.query('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [room.id, req.user.id]);

        // Fetch user display name
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        // Insert system message
        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [room.id, req.user.id, `${user.display_name} joined the group`, 'system']
        );
        const msgId = sysMsgRes.rows[0].id;
        
        // Emit system message
        const io = req.app.get('io');
        io.to(`room:${room.id}`).emit('new_message', {
            id: msgId,
            room_id: room.id,
            user_id: req.user.id,
            content: `${user.display_name} joined the group`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        // Fetch full room details with unread count
        const fullRoom = {
            ...room,
            role: 'member', // default role
            last_read_at: null, // never read
            unread_count: 0 // recently joined
        };

        res.json(fullRoom);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// List Rooms
router.get('/', async (req, res) => {
    try {
        // Optimized query reusing $1
        const roomsRes = await db.query(`
            SELECT r.*, rm.role, rm.last_read_at,
            (SELECT u.display_name FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1) as other_user_name,
            (SELECT u.username FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1) as other_user_username,
            (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.created_at > rm.last_read_at) as unread_count
            FROM rooms r 
            JOIN room_members rm ON r.id = rm.room_id 
            WHERE rm.user_id = $1
            ORDER BY r.created_at DESC
        `, [req.user.id]);
        
        const rooms = roomsRes.rows;
        
        // Map rooms
        const mappedRooms = rooms.map(r => ({
            ...r,
            name: r.type === 'direct' ? (r.other_user_name || 'Unknown User') : r.name,
            username: r.type === 'direct' ? r.other_user_username : null
        }));

        res.json(mappedRooms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Messages
router.get('/:id/messages', async (req, res) => {
    const roomId = req.params.id;

    // Check membership
    const memberCheck = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
    if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member' });
    }

    try {
        const messagesRes = await db.query(`
            SELECT m.id, m.room_id, m.user_id, m.content, m.type, m.status, m.reply_to_message_id, 
                   m.is_deleted_for_everyone, m.deleted_for_user_ids,
                   m.audio_url, m.audio_duration_ms, m.audio_waveform,
                   to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
                   u.display_name, u.username 
            FROM messages m 
            JOIN users u ON m.user_id = u.id 
            WHERE m.room_id = $1 
            ORDER BY m.created_at ASC
        `, [roomId]);
        const messages = messagesRes.rows.map(msg => {
            let parsedWaveform = [];
            if (msg.audio_waveform) {
                try {
                    parsedWaveform = JSON.parse(msg.audio_waveform);
                } catch (e) {
                    console.error("Failed to parse waveform for message", msg.id);
                }
            }
            return {
                ...msg,
                audio_waveform: parsedWaveform
            };
        });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Room Members
router.get('/:id/members', async (req, res) => {
    const roomId = req.params.id;
    try {
        // Check if user is a member first
        const memberCheck = await db.query('SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        const membership = memberCheck.rows[0];
        
        if (!membership) {
            return res.status(403).json({ error: 'Not a member' });
        }

        const membersRes = await db.query(`
            SELECT u.id, u.display_name, u.username, rm.role, rm.joined_at 
            FROM room_members rm 
            JOIN users u ON rm.user_id = u.id 
            WHERE rm.room_id = $1
            ORDER BY rm.role DESC, u.display_name ASC
        `, [roomId]);
        res.json(membersRes.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove Member (Kick)
router.delete('/:id/members/:userId', async (req, res) => {
    const roomId = req.params.id;
    const targetUserId = req.params.userId;

    try {
        // Check requester role
        const requesterRes = await db.query('SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        const requester = requesterRes.rows[0];

        if (!requester || requester.role !== 'owner') {
            return res.status(403).json({ error: 'Only owner can remove members' });
        }

        if (req.user.id == targetUserId) {
             return res.status(400).json({ error: 'Cannot kick yourself' });
        }

        const deleteRes = await db.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, targetUserId]);

        if (deleteRes.rowCount === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // Get target user details for message
        const targetUserRes = await db.query('SELECT display_name FROM users WHERE id = $1', [targetUserId]);
        const targetUser = targetUserRes.rows[0];

        // Insert system message
        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${targetUser.display_name} was removed by owner`, 'system']
        );
        const msgId = sysMsgRes.rows[0].id;
        
        // Emit system message
        const io = req.app.get('io');
        io.to(`room:${roomId}`).emit('new_message', {
            id: msgId,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${targetUser.display_name} was removed by owner`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Leave Room
router.post('/:id/leave', async (req, res) => {
    const roomId = req.params.id;

    try {
        const deleteRes = await db.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);

        if (deleteRes.rowCount === 0) {
            return res.status(404).json({ error: 'Not a member' });
        }
        
        // Fetch user display name
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${user.display_name} left the group`, 'system']
        );
        const msgId = sysMsgRes.rows[0].id;
        
        // Emit system message
        const io = req.app.get('io');
        io.to(`room:${roomId}`).emit('new_message', {
            id: msgId,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${user.display_name} left the group`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark Room as Read
router.post('/:id/read', async (req, res) => {
    const roomId = req.params.id;

    try {
        // Verify membership first
        const memberCheck = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Not a member' });
        }

        // Update last_read_at
        await db.query(`
            UPDATE room_members 
            SET last_read_at = NOW() 
            WHERE room_id = $1 AND user_id = $2
        `, [roomId, req.user.id]);

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

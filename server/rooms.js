const express = require('express');
const db = require('./db');
const crypto = require('crypto');
const { generatePresignedUrl, checkObjectExists, deleteObject, bucketName, region } = require('./s3');
const S3_AVATAR_FOLDER = process.env.S3_AVATAR_FOLDER || 'avatars/';

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

// --- Permission Helpers ---

async function getMemberRole(groupId, userId) {
    const res = await db.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2', [groupId, userId]);
    return res.rows[0]?.role || null;
}

async function getGroupPermissions(groupId) {
    const res = await db.query('SELECT * FROM group_permissions WHERE group_id=$1', [groupId]);
    if (!res.rows.length) {
        return {
            allow_name_change: true,
            allow_description_change: true,
            allow_add_members: true,
            allow_remove_members: true,
            send_mode: 'everyone'
        };
    }
    return res.rows[0];
}

async function setGroupPermissions(groupId, patch) {
    // Ensure record exists
    const exist = await db.query('SELECT 1 FROM group_permissions WHERE group_id=$1', [groupId]);
    if (exist.rows.length === 0) {
        await db.query('INSERT INTO group_permissions (group_id) VALUES ($1)', [groupId]);
    }
    
    const fields = [];
    const values = [groupId];
    let idx = 2;
    
    for (const [key, value] of Object.entries(patch)) {
        fields.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
    }
    
    if (fields.length > 0) {
        await db.query(`UPDATE group_permissions SET ${fields.join(', ')}, updated_at=NOW() WHERE group_id=$1`, values);
    }
}

async function ensurePermission(actorId, groupId, action) {
    const role = await getMemberRole(groupId, actorId);
    if (!role) throw new Error('Not a member');
    
    // Owner always has permission (except where logic dictates otherwise, but for admin actions yes)
    if (role === 'owner') return true;

    const perms = await getGroupPermissions(groupId);

    switch(action) {
        case 'change_name':
            if (!perms.allow_name_change && role !== 'admin') throw new Error('Name changes disabled');
            return true; 
        case 'change_description':
            if (!perms.allow_description_change && role !== 'admin') throw new Error('Description changes disabled');
            return true;
        case 'add_member':
            if (!perms.allow_add_members) {
                if (role !== 'owner') throw new Error('Adding members disabled by owner');
                return true;
            }
            return true; // Any member can add if allowed 
        case 'remove_member':
            if (!perms.allow_remove_members) {
                 if (role !== 'owner') throw new Error('Removing members disabled by owner');
                 return true;
            }
            if (role === 'admin') return true;
            throw new Error('Only admins can remove members');
        case 'promote_member':
             // Only owner can promote (usually). Prompt says "Owner... Admins (if allowed)". 
             // We'll restrict to OWNER for now as per prompt "Owner: can promote/demote anyone".
             return false;
        default:
            return true;
    }
}

// --------------------------

// Create Room
router.post('/', async (req, res) => {
    const { name, type, targetUserId } = req.body; // type: 'group' or 'direct'
    
    if (!type) return res.status(400).json({ error: 'Type required' });

    // Handle Direct Message Room
    if (type === 'direct') {
        if (!targetUserId) return res.status(400).json({ error: 'Target user required for DM' });

        try {
            // Fetch users to get display names and usernames
            const targetUserRes = await db.query('SELECT display_name, username, avatar_thumb_url, avatar_url FROM users WHERE id = $1', [targetUserId]);
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
                // Ensure room is not hidden for the creator
                await db.query('UPDATE room_members SET is_hidden = false WHERE room_id = $1 AND user_id = $2', [existingRoom.id, req.user.id]);

                return res.json({ 
                    ...existingRoom, 
                    name: targetUser.display_name,
                    username: targetUser.username,
                    other_user_id: targetUserId,
                    avatar_thumb_url: targetUser.avatar_thumb_url,
                    avatar_url: targetUser.avatar_url
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
        
        // Initialize Default Permissions
        await db.query('INSERT INTO group_permissions (group_id) VALUES ($1)', [roomId]);

        const permissions = {
            allow_name_change: true, // defaults
            allow_description_change: true,
            allow_add_members: true,
            allow_remove_members: true,
            send_mode: 'everyone'
        };

        res.json({ id: roomId, code, name, type, expires_at: expiresAt, ...permissions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Join Room (via Code)
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

        // Emit system message
        const io = req.app.get('io');
        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [room.id, req.user.id, `${user.display_name} joined the group`, 'system']
        );
        const msgId = sysMsgRes.rows[0].id;

        io.to(`room:${room.id}`).emit('new_message', {
            id: msgId,
            room_id: room.id,
            user_id: req.user.id,
            content: `${user.display_name} joined the group`,
            type: 'system',
            created_at: new Date().toISOString()
        });
        
        // Broadcast member added event
        io.to(`room:${room.id}`).emit('group:member:added', {
             groupId: room.id,
             userId: req.user.id,
             role: 'member'
        });

        // Fetch Permissions
        const permsRes = await db.query('SELECT * FROM group_permissions WHERE group_id=$1', [room.id]);
        const perms = permsRes.rows.length ? permsRes.rows[0] : {
            allow_name_change: true,
            allow_description_change: true,
            allow_add_members: true,
            allow_remove_members: true,
            send_mode: 'everyone'
        };

        const fullRoom = {
            ...room,
            role: 'member',
            last_read_at: null,
            unread_count: 0,
            ...perms
        };

        res.json(fullRoom);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add Member (by Username/ID) - Admin/Owner Only
router.post('/:id/members', async (req, res) => {
    const roomId = req.params.id;
    const { username, userId } = req.body;
    
    try {
        await ensurePermission(req.user.id, roomId, 'add_member');

        let targetUserId = userId;
        // Resolve username if provided
        if (username) {
            const userRes = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username.replace('@','')]); // handle @ prefix
            if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
            targetUserId = userRes.rows[0].id;
        }
        
        if (!targetUserId) return res.status(400).json({ error: 'User ID or Username required' });

         // Check if already member
        const memberCheck = await db.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, targetUserId]);
        if (memberCheck.rows.length > 0) return res.status(400).json({ error: 'Already a member' });

        await db.query('INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3)', [roomId, targetUserId, 'member']);

        // System Msg
        const actorRes = await db.query('SELECT display_name FROM users WHERE id=$1', [req.user.id]);
        const targetRes = await db.query('SELECT display_name FROM users WHERE id=$1', [targetUserId]);
        
        const io = req.app.get('io');
        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${targetRes.rows[0].display_name} was added by ${actorRes.rows[0].display_name}`, 'system']
        );
        
        io.to(`room:${roomId}`).emit('new_message', {
             id: sysMsgRes.rows[0].id,
             room_id: parseInt(roomId),
             user_id: req.user.id,
             content: `${targetRes.rows[0].display_name} was added by ${actorRes.rows[0].display_name}`,
             type: 'system',
             created_at: new Date().toISOString()
        });

        // Broadcast Member Added
        io.to(`room:${roomId}`).emit('group:member:added', {
             groupId: parseInt(roomId),
             userId: targetUserId,
             role: 'member'
        });
        
        // Notify Target (Invite)
        io.to(`user:${targetUserId}`).emit('group:invited', { groupId: parseInt(roomId), invitedBy: req.user.id });

        res.json({ success: true });

    } catch (error) {
        console.error(error);
        if (error.message.includes('disabled') || error.message.includes('Only admins')) {
            return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: 'Server error' });
    }
});


// List Rooms
router.get('/', async (req, res) => {
    try {
        const roomsRes = await db.query(`
            SELECT r.*, rm.role, rm.last_read_at,
            (SELECT u.display_name FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_name,
            (SELECT u.username FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_username,
            (SELECT u.avatar_thumb_url FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_avatar_thumb,
            (SELECT u.avatar_url FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_avatar_url,
            (SELECT u.id FROM room_members rm2 JOIN users u ON rm2.user_id = u.id WHERE rm2.room_id = r.id AND rm2.user_id != $1 LIMIT 1) as other_user_id,
            (SELECT u.display_name FROM users u WHERE u.id = r.created_by) as creator_name,
            (SELECT u.username FROM users u WHERE u.id = r.created_by) as creator_username,
            (SELECT u.username FROM users u WHERE u.id = r.created_by) as creator_username,
            (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.created_at > rm.last_read_at) as unread_count,
            gp.send_mode, gp.allow_name_change, gp.allow_description_change, gp.allow_add_members, gp.allow_remove_members
            FROM rooms r 
            JOIN room_members rm ON r.id = rm.room_id 
            LEFT JOIN group_permissions gp ON r.id = gp.group_id
            WHERE rm.user_id = $1 AND (rm.is_hidden IS FALSE OR rm.is_hidden IS NULL)
            ORDER BY r.created_at DESC
        `, [req.user.id]);
        
        const rooms = roomsRes.rows;
        
        const mappedRooms = rooms.map(r => ({
            ...r,
            name: r.type === 'direct' ? (r.other_user_name || 'Unknown User') : r.name,
            username: r.type === 'direct' ? r.other_user_username : null,
            other_user_id: r.type === 'direct' ? r.other_user_id : null,
            // For groups, use their own avatar. For DM, use other user's.
            avatar_thumb_url: r.type === 'direct' ? r.other_user_avatar_thumb : r.avatar_thumb_url,
            avatar_url: r.type === 'direct' ? r.other_user_avatar_url : r.avatar_url,
            // Pass creator info
            creator_name: r.creator_name,
            creator_username: r.creator_username
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
    const memberCheck = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
    if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member' });
    }

    try {
        const messagesRes = await db.query(`
            SELECT m.id, m.room_id, m.user_id, m.content, m.type, m.status, m.reply_to_message_id, 
                   m.is_deleted_for_everyone, m.deleted_for_user_ids, m.edited_at,
                   m.audio_url, m.audio_duration_ms, m.audio_waveform,
                   m.gif_url, m.preview_url, m.width, m.height,
                   m.author_name, m.meta,
                   (aps.heard_at IS NOT NULL) as audio_heard,
                   m.created_at,
                   u.display_name, u.username, u.avatar_thumb_url, u.avatar_url 
            FROM messages m 
            JOIN users u ON m.user_id = u.id 
            LEFT JOIN audio_play_state aps ON m.id = aps.message_id AND aps.user_id = $2
            JOIN room_members rm_curr ON rm_curr.room_id = m.room_id AND rm_curr.user_id = $2
            WHERE m.room_id = $1 
            AND m.created_at > COALESCE(rm_curr.cleared_at, '1970-01-01')
            ORDER BY m.created_at ASC
        `, [roomId, req.user.id]);

        const messages = messagesRes.rows.map(msg => {
            let parsedWaveform = [];
            if (msg.audio_waveform) {
                try {
                    parsedWaveform = JSON.parse(msg.audio_waveform);
                } catch (e) {
                    // ignore
                }
            }
            return { ...msg, audio_waveform: parsedWaveform };
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
        const memberCheck = await db.query('SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (!memberCheck.rows.length) return res.status(403).json({ error: 'Not a member' });

        const membersRes = await db.query(`
            SELECT u.id, u.display_name, u.username, u.avatar_thumb_url, rm.role, rm.joined_at 
            FROM room_members rm 
            JOIN users u ON rm.user_id = u.id 
            WHERE rm.room_id = $1
            ORDER BY 
                CASE WHEN rm.role = 'owner' THEN 1 WHEN rm.role = 'admin' THEN 2 ELSE 3 END,
                u.display_name ASC
        `, [roomId]);
        res.json(membersRes.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove Member (Kick) / Leave
router.delete('/:id/members/:userId', async (req, res) => {
    const roomId = req.params.id;
    const targetUserId = req.params.userId;

    try {
        // If removing self, it's a leave (handled by /leave mostly, but let's allow it here too if exact REST)
        // But prompt has /leave. Let's assume this is mostly for kicking.
        if (req.user.id == targetUserId) {
             // Treat as leave? Or error?
             return res.status(400).json({ error: 'Use /leave to leave' });
        }

        await ensurePermission(req.user.id, roomId, 'remove_member');

        // Extra Checks: 
        // Admin cannot remove Owner.
        // Admin cannot remove Admin (usually). Prompt: "Admins... cannot remove admins/owner".
        const targetRole = await getMemberRole(roomId, targetUserId);
        const actorRole = await getMemberRole(roomId, req.user.id);

        if (targetRole === 'owner') return res.status(403).json({ error: 'Cannot remove owner' });
        if (targetRole === 'admin' && actorRole !== 'owner') return res.status(403).json({ error: 'Admins cannot remove other admins' });

        const deleteRes = await db.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, targetUserId]);
        if (deleteRes.rowCount === 0) return res.status(404).json({ error: 'Member not found' });

        // System Msg
        const targetUserRes = await db.query('SELECT display_name FROM users WHERE id = $1', [targetUserId]);
        const targetUser = targetUserRes.rows[0];

        const io = req.app.get('io');
        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${targetUser.display_name} was removed`, 'system']
        );
        
        io.to(`room:${roomId}`).emit('new_message', {
            id: sysMsgRes.rows[0].id,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${targetUser.display_name} was removed`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        // Broadcast Removal
        io.to(`room:${roomId}`).emit('group:member:removed', { groupId: parseInt(roomId), userId: targetUserId });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        if (error.message.includes('disabled') || error.message.includes('Only admins')) {
            return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// Promote Member
router.post('/:id/members/:userId/promote', async (req, res) => {
    const { id: roomId, userId } = req.params;
    try {
        const actorRole = await getMemberRole(roomId, req.user.id);
        if (actorRole !== 'owner') return res.status(403).json({ error: 'Only owner can promote' });

        const targetRole = await getMemberRole(roomId, userId);
        if (!targetRole) return res.status(404).json({ error: 'Member not found' });
        if (targetRole === 'owner' || targetRole === 'admin') return res.status(400).json({ error: 'Already admin or owner' });

        await db.query('UPDATE room_members SET role=$1 WHERE room_id=$2 AND user_id=$3', ['admin', roomId, userId]);

        const io = req.app.get('io');
        io.to(`room:${roomId}`).emit('group:member:role-updated', { groupId: parseInt(roomId), userId, role: 'admin' });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Demote Member
router.post('/:id/members/:userId/demote', async (req, res) => {
    const { id: roomId, userId } = req.params;
    try {
        const actorRole = await getMemberRole(roomId, req.user.id);
        if (actorRole !== 'owner') return res.status(403).json({ error: 'Only owner can demote' });

        const targetRole = await getMemberRole(roomId, userId);
        if (targetRole !== 'admin') return res.status(400).json({ error: 'User is not admin' });

        await db.query('UPDATE room_members SET role=$1 WHERE room_id=$2 AND user_id=$3', ['member', roomId, userId]);

        const io = req.app.get('io');
        io.to(`room:${roomId}`).emit('group:member:role-updated', { groupId: parseInt(roomId), userId, role: 'member' });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Transfer Ownership
router.post('/:id/transfer-ownership', async (req, res) => {
    const roomId = req.params.id;
    const { newOwnerId } = req.body;
    try {
        const actorRole = await getMemberRole(roomId, req.user.id);
        if (actorRole !== 'owner') return res.status(403).json({ error: 'Only owner can transfer ownership' });

        if (req.user.id == newOwnerId) return res.status(400).json({ error: 'Already owner' });

        // Verify new owner is member
        const targetRole = await getMemberRole(roomId, newOwnerId);
        if (!targetRole) return res.status(404).json({ error: 'New owner must be a member' });

        // Transaction
        // 1. Demote old owner to admin (or member? Prompt says based on choice, let's default to Admin)
        await db.query('UPDATE room_members SET role=$1 WHERE room_id=$2 AND user_id=$3', ['admin', roomId, req.user.id]);
        // 2. Promote new owner
        await db.query('UPDATE room_members SET role=$1 WHERE room_id=$2 AND user_id=$3', ['owner', roomId, newOwnerId]);

        const io = req.app.get('io');
        // Emit events
        io.to(`room:${roomId}`).emit('group:member:role-updated', { groupId: parseInt(roomId), userId: req.user.id, role: 'admin' });
        io.to(`room:${roomId}`).emit('group:member:role-updated', { groupId: parseInt(roomId), userId: newOwnerId, role: 'owner' });
        io.to(`room:${roomId}`).emit('group:ownership:transferred', { groupId: parseInt(roomId), oldOwnerId: req.user.id, newOwnerId });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Permissions
router.get('/:id/permissions', async (req, res) => {
    try {
        // Authenticated member check?
        const memberRole = await getMemberRole(req.params.id, req.user.id);
        if (!memberRole) return res.status(403).json({ error: 'Not a member' });

        const perms = await getGroupPermissions(req.params.id);
        res.json(perms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update Permissions
router.patch('/:id/permissions', async (req, res) => {
    const roomId = req.params.id;
    try {
        const actorRole = await getMemberRole(roomId, req.user.id);
        if (actorRole !== 'owner' && actorRole !== 'admin') return res.status(403).json({ error: 'Only owner/admin can change permissions' });

        await setGroupPermissions(roomId, req.body);
        const newPerms = await getGroupPermissions(roomId);

        const io = req.app.get('io');

        // System Msg
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${user.display_name} updated group permissions`, 'system']
        );

        io.to(`room:${roomId}`).emit('new_message', {
            id: sysMsgRes.rows[0].id,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${user.display_name} updated group permissions`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        io.to(`room:${roomId}`).emit('group:permissions:updated', { groupId: parseInt(roomId), permissions: newPerms });

        res.json(newPerms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Leave Room (Already implemented partially above, let's keep standardized)
router.post('/:id/leave', async (req, res) => {
    const roomId = req.params.id;
    try {
        const deleteRes = await db.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (deleteRes.rowCount === 0) return res.status(404).json({ error: 'Not a member' });
        
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const io = req.app.get('io');
        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${user.display_name} left the group`, 'system']
        );
        
        io.to(`room:${roomId}`).emit('new_message', {
            id: sysMsgRes.rows[0].id,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${user.display_name} left the group`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        io.to(`room:${roomId}`).emit('group:member:removed', { groupId: parseInt(roomId), userId: req.user.id });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark Room as Read
router.post('/:id/read', async (req, res) => {
    try {
        await db.query('UPDATE room_members SET last_read_at = NOW() WHERE room_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Clear Messages
router.post('/:id/clear', async (req, res) => {
    try {
        await db.query('UPDATE room_members SET cleared_at = NOW() WHERE room_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        const io = req.app.get('io');
        io.to(`user:${req.user.id}`).emit('chat:cleared', { roomId: req.params.id, userId: req.user.id });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Clear Messages (DELETE method for AI Chat)
router.delete('/:id/messages', async (req, res) => {
    try {
        const roomId = req.params.id;
        
        // Check room type
        const roomRes = await db.query('SELECT type FROM rooms WHERE id = $1', [roomId]);
        const roomType = roomRes.rows[0]?.type;

        if (roomType === 'ai') {
            // Hard delete for AI rooms
            await db.query('DELETE FROM messages WHERE room_id = $1', [roomId]);
            // Also reset cleared_at since messages are gone? Or keep it? 
            // Resetting it is cleaner so future messages are visible without relying on old timestamp.
            await db.query('UPDATE room_members SET cleared_at = NULL WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        } else {
            // Soft delete (hide) for other rooms
            // Use CURRENT_TIMESTAMP + interval to be safe against clock skew or concurrent inserts
            await db.query("UPDATE room_members SET cleared_at = (CURRENT_TIMESTAMP + interval '1 second') WHERE room_id = $1 AND user_id = $2", [roomId, req.user.id]);
        }
        
        const io = req.app.get('io');
        io.to(`user:${req.user.id}`).emit('chat:cleared', { roomId: roomId, userId: req.user.id });
        res.json({ ok: true });
    } catch (error) {
        console.error('[DEBUG] Error clearing messages:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete Chat (Hide for user)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('UPDATE room_members SET is_hidden = TRUE WHERE room_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        const io = req.app.get('io');
        io.to(`user:${req.user.id}`).emit('chat:deleted', { roomId: req.params.id, userId: req.user.id });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Destroy Group (Hard Delete) - Owner Only
router.delete('/:id/destroy', async (req, res) => {
    const roomId = req.params.id;
    try {
        const role = await getMemberRole(roomId, req.user.id);
        if (role !== 'owner') return res.status(403).json({ error: 'Only owner can delete the group' });

        // Delete associated data (Cascading deletes usually handle this if set up, but let's be safe or assume cascade)
        // Assuming FOREIGN KEY constraints might fail if not cascading.
        // Let's rely on DB cascading if possible, or delete manual.
        // "DELETE FROM rooms" might fail if messages exist. 
        // Let's try deleting the room and catch error if constraints prevent it, 
        // but typically 'rooms' should cascade to 'messages', 'room_members'.
        // If not, we need to delete children first.
        // Let's assume standard cascade for now, or delete explicit.
        
        await db.query('DELETE FROM messages WHERE room_id = $1', [roomId]);
        await db.query('DELETE FROM room_members WHERE room_id = $1', [roomId]);
        await db.query('DELETE FROM group_permissions WHERE group_id = $1', [roomId]);
        await db.query('DELETE FROM rooms WHERE id = $1', [roomId]);

        const io = req.app.get('io');
        // Notify all members via room room that it's gone
        io.to(`room:${roomId}`).emit('chat:deleted', { roomId }); // Reuse chat:deleted event? or specific? 
        // Existing chat:deleted expects { roomId, userId } usually for single user.
        // If I emit to `room:id`, clients need to handle it.
        // Dashboard.jsx listens to 'chat:deleted'.
        // Let's verify Dashboard.jsx handling of 'chat:deleted'. 
        // It does: ` setRooms(prev => prev.filter(r => String(r.id) !== String(roomId))); `
        // And checks valid payload.
        // If I broadcast to room, all connected clients in that room will receive it.
        
        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update Bio
router.put('/:id/bio', async (req, res) => {
    const roomId = req.params.id;
    const { bio } = req.body;
    try {
        await ensurePermission(req.user.id, roomId, 'change_description');
        
        await db.query('UPDATE rooms SET bio = $1 WHERE id = $2', [bio, roomId]);
        
        // System Msg
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const io = req.app.get('io');
        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${user.display_name} changed the group description`, 'system']
        );
        
        io.to(`room:${roomId}`).emit('new_message', {
            id: sysMsgRes.rows[0].id,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${user.display_name} changed the group description`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        io.to(`room:${roomId}`).emit('room:updated', { roomId: parseInt(roomId), bio });
        res.json({ success: true, bio });
    } catch (error) {
        console.error(error);
        if (error.message.includes('disabled')) return res.status(403).json({ error: error.message });
        res.status(500).json({ error: 'Failed' });
    }
});

// Update Group Name
router.put('/:id/name', async (req, res) => {
    const roomId = req.params.id;
    const { name } = req.body;
    
    if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Name cannot be empty' });

    try {
        await ensurePermission(req.user.id, roomId, 'change_name');
        
        await db.query('UPDATE rooms SET name = $1 WHERE id = $2', [name, roomId]);

        // System Msg
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const io = req.app.get('io');
        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${user.display_name} changed the group name to "${name}"`, 'system']
        );

        io.to(`room:${roomId}`).emit('new_message', {
            id: sysMsgRes.rows[0].id,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${user.display_name} changed the group name to "${name}"`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        io.to(`room:${roomId}`).emit('room:updated', { roomId: parseInt(roomId), name });
        res.json({ success: true, name });
    } catch (error) {
        console.error(error);
        if (error.message.includes('disabled')) return res.status(403).json({ error: error.message });
        res.status(500).json({ error: 'Failed' });
    }
});



// ... (existing imports)

// ... (existing code)

// Group Avatar: Presign URL
router.post('/:id/avatar/presign', async (req, res) => {
    const roomId = req.params.id;
    const { files } = req.body;

    try {
        await ensurePermission(req.user.id, roomId, 'change_description'); // changing avatar similar to bio/desc logic? 
        // Or strict owner/admin? Plan said "Owner/Admin".
        // `change_description` logic: if allowed, members can too.
        // Let's stick to Owner/Admin for now as per plan "visible to Owner/Admin".
        // Re-read plan: "Add 'Edit' pencil icon on the avatar (visible to Owner/Admin)."
        // So strict check:
        const role = await getMemberRole(roomId, req.user.id);
        if (role !== 'owner' && role !== 'admin') {
             return res.status(403).json({ error: 'Only admins/owners can change avatar' });
        }

        if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'Invalid body' });

        const uploads = [];
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

        for (const file of files) {
            if (!allowedTypes.includes(file.contentType)) return res.status(400).json({ error: `Invalid content type: ${file.contentType}` });
            
            const fileId = crypto.randomUUID();
            const ext = file.contentType.split('/')[1];
            const key = `${S3_AVATAR_FOLDER}group-${roomId}-${fileId}-${file.type}.${ext}`;

            const url = await generatePresignedUrl(key, file.contentType, 300);

            uploads.push({
                fileId,
                url,
                key,
                method: 'PUT',
                headers: { 'Content-Type': file.contentType },
                type: file.type
            });
        }
        
        res.json({ uploads, expiresIn: 300 });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Group Avatar: Complete Upload
router.post('/:id/avatar/complete', async (req, res) => {
    const roomId = req.params.id;
    const { uploads } = req.body;

    try {
        const role = await getMemberRole(roomId, req.user.id);
        if (role !== 'owner' && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

        if (!uploads || !Array.isArray(uploads)) return res.status(400).json({ error: 'Invalid body' });

        let avatarParsed = null;
        let thumbParsed = null;
        let baseKey = null;

        for (const upload of uploads) {
            const exists = await checkObjectExists(upload.key);
            if (!exists) return res.status(400).json({ error: `File not found in S3: ${upload.key}` });

            const domain = process.env.CLOUDFRONT_DOMAIN || `https://${bucketName}.s3.${region}.amazonaws.com`;
            const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
            const publicUrl = `${baseUrl}/${upload.key}`;

            if (upload.type === 'avatar') {
                avatarParsed = publicUrl;
                baseKey = upload.key;
            } else if (upload.type === 'thumb') {
                thumbParsed = publicUrl;
            }
        }

        if (!avatarParsed) return res.status(400).json({ error: 'Missing avatar file' });
        const finalThumb = thumbParsed || avatarParsed;

        // Update DB
        await db.query(
            'UPDATE rooms SET avatar_url = $1, avatar_thumb_url = $2, avatar_key = $3 WHERE id = $4',
            [avatarParsed, finalThumb, baseKey, roomId]
        );

        // Broadcast Event
        const io = req.app.get('io');
        
        // System Msg
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${user.display_name} changed the group photo`, 'system']
        );

        io.to(`room:${roomId}`).emit('new_message', {
            id: sysMsgRes.rows[0].id,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${user.display_name} changed the group photo`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        io.to(`room:${roomId}`).emit('room:updated', { 
            roomId: parseInt(roomId), 
            avatar_url: avatarParsed, 
            avatar_thumb_url: finalThumb 
        });

        res.json({ success: true, avatar_url: avatarParsed, avatar_thumb_url: finalThumb });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Group Avatar: Delete
router.delete('/:id/avatar', async (req, res) => {
    const roomId = req.params.id;
    try {
        const role = await getMemberRole(roomId, req.user.id);
        if (role !== 'owner' && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

        const roomRes = await db.query('SELECT avatar_key, avatar_url FROM rooms WHERE id = $1', [roomId]);
        const room = roomRes.rows[0];

        if (!room || !room.avatar_url) return res.status(404).json({ error: 'No avatar' });

        if (room.avatar_key) {
            await deleteObject(room.avatar_key);
            if (room.avatar_key.includes('-avatar.')) {
                const thumbKey = room.avatar_key.replace('-avatar.', '-thumb.');
                await deleteObject(thumbKey).catch(e => console.warn("Failed to delete thumb S3", e));
            }
        }

        await db.query('UPDATE rooms SET avatar_url = NULL, avatar_thumb_url = NULL, avatar_key = NULL WHERE id = $1', [roomId]);

        const io = req.app.get('io');

        // System Msg
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const sysMsgRes = await db.query(
            'INSERT INTO messages (room_id, user_id, content, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [roomId, req.user.id, `${user.display_name} removed the group photo`, 'system']
        );

        io.to(`room:${roomId}`).emit('new_message', {
            id: sysMsgRes.rows[0].id,
            room_id: parseInt(roomId),
            user_id: req.user.id,
            content: `${user.display_name} removed the group photo`,
            type: 'system',
            created_at: new Date().toISOString()
        });

        io.to(`room:${roomId}`).emit('room:updated', { 
            roomId: parseInt(roomId), 
            avatar_url: null, 
            avatar_thumb_url: null 
        });

        res.json({ success: true });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

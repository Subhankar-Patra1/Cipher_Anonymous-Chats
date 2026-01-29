// ai.js - Local AI Persistence
const { v4: uuidv4 } = require('uuid');

let IO = null;
let DB = null;
let REDIS = null;

function setupAI(app, io, db, redisClient) {
    IO = io;
    DB = db;
    REDIS = redisClient;

    // Routes
    app.post('/api/ai/cancel', (req, res) => res.json({ ok: true })); // No-op for local AI
    app.post('/api/ai/save', handleSaveAiMessage);
    app.post('/api/ai/save-user', handleSaveUserMessage); // [NEW] Save user messages
    app.get('/api/ai/session', handleGetSession);

    console.log('[AI] Local AI Service initialized (WebGPU mode)');
}


async function handleGetSession(req, res) {
    let userId = null;
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('No token');
        const jwt = require('jsonwebtoken');
        if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not configured');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Check if an AI session already exists for the user
        const existingSessionRes = await DB.query('SELECT room_id, ai_name FROM ai_sessions WHERE user_id = $1', [userId]);
        let roomId;
        let aiName = 'Sparkle AI';

        if (existingSessionRes.rows.length > 0) {
            roomId = existingSessionRes.rows[0].room_id;
            aiName = existingSessionRes.rows[0].ai_name || 'Sparkle AI';
            // [FIX] Ensure room is not hidden if user returns to it
            await DB.query('UPDATE room_members SET is_hidden = false WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
        } else {
             // Create new if not exists
            roomId = await ensureAiRoom(userId);
        }
        res.json({ roomId, aiName });
    } catch(e) {
        console.error("AI Session Error:", e);
        res.status(500).json({ error: "Failed to get AI session" });
    }
}

// Helper to get system AI user ID
async function ensureAiUser() {
    // Check if exists by username (email column doesn't exist in this schema)
    const res = await DB.query("SELECT id FROM users WHERE username = 'SparkleAI'");
    if (res.rows.length > 0) return res.rows[0].id;

    // Create if missing. 
    // Using dummy values for constraints. ID must be UUID.
    try {
        const newAi = await DB.query(`
            INSERT INTO users (username, display_name, password_hash)
            VALUES ('SparkleAI', 'Sparkle AI', 'system_account')
            RETURNING id
        `);
        return newAi.rows[0].id;
    } catch (e) {
        // Race condition fallback
        const res2 = await DB.query("SELECT id FROM users WHERE username = 'SparkleAI'");
        if (res2.rows.length > 0) return res2.rows[0].id;
        throw e;
    }
}

// Ensure AI Room exists for user
async function ensureAiRoom(userId) {
    // Check cache/DB
    const res = await DB.query('SELECT room_id FROM ai_sessions WHERE user_id = $1', [userId]);
    if (res.rows.length > 0) {
        return res.rows[0].room_id;
    }

    const aiUserId = await ensureAiUser();

    // Create new room
    // 1. Create Room (private, system managed)
    const roomRes = await DB.query(`
        INSERT INTO rooms (name, type, created_by) 
        VALUES ($1, 'ai', $2) 
        RETURNING id
    `, ['AI Assistant', userId]);
    const roomId = roomRes.rows[0].id;

    // 2. Add user to room
    await DB.query(`
        INSERT INTO room_members (room_id, user_id, role) 
        VALUES ($1, $2, 'owner')
    `, [roomId, userId]);
    
     // Add AI member (virtual)
     await DB.query(`
        INSERT INTO room_members (room_id, user_id, role) 
        VALUES ($1, $2, 'member')
    `, [roomId, aiUserId]);

    // 3. Create session map
    await DB.query(`
        INSERT INTO ai_sessions (user_id, room_id, ai_name) 
        VALUES ($1, $2, 'Sparkle AI')
    `, [userId, roomId]);

    // [FIX] Emit room_added so client updates list immediately
    if (IO) {
        IO.to(`user:${userId}`).emit('room_added', {
            id: roomId,
            name: 'Sparkle AI',
            type: 'ai',
            last_message: null,
            unread_count: 0,
            created_at: new Date().toISOString()
        });
    }

    return roomId;
}

// [NEW] Save AI-generated message
async function handleSaveAiMessage(req, res) {
    let userId = null;
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('No token');
        const jwt = require('jsonwebtoken');
        if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not configured');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { roomId, content, operationId, meta } = req.body;

    if (!roomId || !content) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        // Double check room access
        const roomCheck = await DB.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
        if (roomCheck.rows.length === 0) return res.status(403).json({ error: 'Not in room' });

        const aiUserId = await ensureAiUser();
        const createdAt = new Date().toISOString();
        
        // Insert as Assistant
        const result = await DB.query(`
            INSERT INTO messages (room_id, user_id, content, meta, created_at, status, author_name) 
            VALUES ($1, $2, $3, $4, $5, 'seen', 'Assistant')
            RETURNING id, created_at
        `, [
            roomId, 
            aiUserId, 
            content, 
            JSON.stringify({ ...(meta || {}), ai: true, operationId }),
            createdAt
        ]);

        const msg = result.rows[0];

        // [NEW] Mark the user's query message as 'seen' since AI has responded
        if (operationId) {
            await DB.query(`
                UPDATE messages SET status = 'seen' 
                WHERE room_id = $1 AND meta->>'operationId' = $2 AND user_id = $3
            `, [roomId, operationId, userId]);
        }

        // Emit new_message to device (so other tabs sync)
        const fullMsg = {
           id: msg.id,
           room_id: roomId,
           user_id: aiUserId,
           content,
           created_at: msg.created_at,
           author_name: 'Assistant',
           display_name: 'Sparkle AI',
           type: 'text',
           meta: { ...(meta || {}), ai: true, operationId, silent: true },
           status: 'seen'
        };

        // Broadcast to user's room channel (so sidebar updates)
        IO.to(`room:${roomId}`).emit('new_message', fullMsg);

        // [NEW] Trigger sidebar refresh for the user
        IO.to(`user:${userId}`).emit('rooms:refresh');
        
        // Shape room for sidebar update
        const formattedRoom = {
            id: roomId,
            name: 'Sparkle AI',
            type: 'ai',
            last_message: content,
            last_message_at: msg.created_at,
            unread_count: 0,
            created_at: msg.created_at
        };
        IO.to(`user:${userId}`).emit('room_added', formattedRoom);



        res.json({ ok: true, id: msg.id });


    } catch (e) {
        console.error('Save AI message failed:', e);
        res.status(500).json({ error: e.message });
    }
}

// [NEW] Save user message in AI chat
async function handleSaveUserMessage(req, res) {
    let userId = null;
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('No token');
        const jwt = require('jsonwebtoken');
        if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not configured');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { roomId, content, operationId, meta } = req.body;

    if (!roomId || !content) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        // Double check room access
        const roomCheck = await DB.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
        if (roomCheck.rows.length === 0) return res.status(403).json({ error: 'Not in room' });

        const createdAt = new Date().toISOString();
        
        // Insert user's message
        const result = await DB.query(`
            INSERT INTO messages (room_id, user_id, content, meta, created_at, status) 
            VALUES ($1, $2, $3, $4, $5, 'sent')
            RETURNING id, created_at
        `, [
            roomId, 
            userId, 
            content, 
            JSON.stringify({ ...(meta || {}), operationId }),
            createdAt
        ]);

        const msg = result.rows[0];

        // Get user display name for sidebar
        const userRes = await DB.query('SELECT display_name, username FROM users WHERE id = $1', [userId]);
        const userData = userRes.rows[0] || {};

        // Emit new_message for sidebar update
        const fullMsg = {
            id: msg.id,
            room_id: roomId,
            user_id: userId,
            content,
            created_at: msg.created_at,
            display_name: userData.display_name || userData.username,
            type: 'text',
            meta: { ...(meta || {}), operationId, silent: true },
            status: 'sent'
        };

        IO.to(`room:${roomId}`).emit('new_message', fullMsg);

        // [NEW] Trigger sidebar refresh for the user
        IO.to(`user:${userId}`).emit('rooms:refresh');

        // Shape room for sidebar update
        const formattedRoom = {
            id: roomId,
            name: 'Sparkle AI',
            type: 'ai',
            last_message: content,
            last_message_at: msg.created_at,
            unread_count: 0,
            created_at: msg.created_at
        };
        IO.to(`user:${userId}`).emit('room_added', formattedRoom);

        res.json({ 
            ok: true, 
            id: msg.id, 
            created_at: msg.created_at,
            status: 'sent'
        });


    } catch (e) {
        console.error('Save user message failed:', e);
        res.status(500).json({ error: e.message });
    }
}

module.exports = { setupAI };


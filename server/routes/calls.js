const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to check auth
const authenticate = (req, res, next) => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
    
    let token = req.headers.authorization?.split(' ')[1];
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

// Create a Call Log Entry
router.post('/', async (req, res) => {
    try {
        // [FIX] Accept both camelCase and snake_case field names
        const receiverId = req.body.receiverId || req.body.receiver_id;
        const roomId = req.body.roomId || req.body.room_id;
        const { type, status, duration } = req.body;
        const startedAt = req.body.startedAt || req.body.started_at;
        const endedAt = req.body.endedAt || req.body.ended_at;
        
        // Basic validation
        if (!receiverId || !type || !status) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await db.query(
            `INSERT INTO calls (caller_id, receiver_id, room_id, type, status, started_at, ended_at, duration)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                req.user.id, 
                receiverId, 
                roomId || null, 
                type, 
                status, 
                startedAt || new Date(), 
                endedAt || null, 
                duration || 0
            ]
        );

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error creating call log:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Call History
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const result = await db.query(`
            SELECT 
                c.id, c.caller_id, c.receiver_id, c.room_id, c.type, c.status, c.started_at, c.ended_at, c.duration,
                u1.display_name as caller_name, u1.username as caller_username, u1.avatar_thumb_url as caller_avatar,
                u2.display_name as receiver_name, u2.username as receiver_username, u2.avatar_thumb_url as receiver_avatar
            FROM calls c
            JOIN users u1 ON c.caller_id = u1.id
            JOIN users u2 ON c.receiver_id = u2.id
            WHERE c.caller_id = $1 OR c.receiver_id = $1
            ORDER BY c.started_at DESC
            LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);

        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching call history:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// [NEW] Delete a single call log entry
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const callId = req.params.id;

        // Only allow deleting your own calls
        const result = await db.query(
            `DELETE FROM calls WHERE id = $1 AND (caller_id = $2 OR receiver_id = $2) RETURNING id`,
            [callId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Call not found' });
        }

        res.json({ success: true, id: callId });
    } catch (err) {
        console.error('Error deleting call log:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// [NEW] Clear all call history for current user
router.delete('/', async (req, res) => {
    try {
        const userId = req.user.id;

        await db.query(
            `DELETE FROM calls WHERE caller_id = $1 OR receiver_id = $1`,
            [userId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error clearing call history:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

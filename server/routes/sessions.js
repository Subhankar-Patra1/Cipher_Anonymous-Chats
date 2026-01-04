const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Middleware to verify token and extract user
const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

router.use(authenticate);

// GET /api/sessions: List all active sessions
router.get('/', async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT id, device_name, device_type, os, browser, ip_address, location, last_active_at, created_at FROM user_sessions WHERE user_id = $1 ORDER BY last_active_at DESC',
            [req.user.id]
        );

        const currentSessionId = req.user.sessionId;
        const sessions = rows.map(session => ({
            ...session,
            isCurrent: session.id === currentSessionId
        }));

        res.json(sessions);
    } catch (err) {
        console.error('Error fetching sessions:', err);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// PUT /api/sessions/:id/name: Rename a specific session
router.put('/:id/name', async (req, res) => {
    const sessionId = req.params.id;
    const { name } = req.body;

    if (!sessionId || !name) return res.status(400).json({ error: 'Session ID and name required' });
    if (name.length > 50) return res.status(400).json({ error: 'Name too long' });

    try {
        const result = await db.query(
            'UPDATE user_sessions SET device_name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [name, sessionId, req.user.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ success: true, session: result.rows[0] });
    } catch (err) {
        console.error('Error renaming session:', err);
        res.status(500).json({ error: 'Failed to rename session' });
    }
});

// POST /api/sessions/:id/revoke: Revoke a specific session
router.post('/:id/revoke', async (req, res) => {
    const sessionId = req.params.id;

    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
    if (sessionId === req.user.sessionId) return res.status(400).json({ error: 'Cannot revoke current session' });

    try {
        // [RATE LIMIT TODO] - Simple check implementation skipped for brevity, but recommended
        
        await db.query('DELETE FROM user_sessions WHERE id = $1 AND user_id = $2', [sessionId, req.user.id]);
        
        // Notify the specific user-session to logout
        // Since we don't have direct socket access here easily without passing io, 
        // we can emit to the user room and client will check if their session matches.
        // BETTER: Use a system to lookup socket by session, OR emit 'session:revoked' event 
        // with payload { revokedSessionId: ... } to `user:userId`.
        // All clients receive it, check if their sessionId matches, and logout if so.
        
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.user.id}`).emit('session:revoked', { sessionId });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error revoking session:', err);
        res.status(500).json({ error: 'Failed to revoke session' });
    }
});

// POST /api/sessions/revoke-others: Revoke all other sessions
router.post('/revoke-others', async (req, res) => {
    try {
        await db.query('DELETE FROM user_sessions WHERE user_id = $1 AND id != $2', [req.user.id, req.user.sessionId]);
        
        const io = req.app.get('io');
        if (io) {
             // Emit to user room - all other devices will match the criteria
             io.to(`user:${req.user.id}`).emit('session:revoked-others', { currentSessionId: req.user.sessionId });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error revoking other sessions:', err);
        res.status(500).json({ error: 'Failed to revoke sessions' });
    }
});

module.exports = router;

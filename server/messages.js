const express = require('express');
const db = require('./db');
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

module.exports = router;

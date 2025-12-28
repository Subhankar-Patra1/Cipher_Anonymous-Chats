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

// Create a new poll
router.post('/', async (req, res) => {
    const { room_id, question, options, is_multiple_choice = false, is_anonymous = false } = req.body;
    
    try {
        // Verify room membership
        const memberRes = await db.query(
            'SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2',
            [room_id, req.user.id]
        );
        if (memberRes.rows.length === 0) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }

        // Validate question length (max 250 characters including emojis)
        if (!question || question.trim().length === 0) {
            return res.status(400).json({ error: 'Question is required' });
        }
        if ([...question].length > 250) {
            return res.status(400).json({ error: 'Question must be 250 characters or less' });
        }

        // Validate options
        if (!options || !Array.isArray(options) || options.length < 2) {
            return res.status(400).json({ error: 'At least 2 options required' });
        }

        // Validate each option length (max 50 characters including emojis)
        for (let i = 0; i < options.length; i++) {
            if ([...options[i]].length > 50) {
                return res.status(400).json({ error: `Option ${i + 1} must be 50 characters or less` });
            }
        }

        // Start transaction
        await db.query('BEGIN');

        // Create message first
        const msgResult = await db.query(`
            INSERT INTO messages (room_id, user_id, type, content)
            VALUES ($1, $2, 'poll', $3)
            RETURNING id, created_at
        `, [room_id, req.user.id, question]);
        
        const messageId = msgResult.rows[0].id;
        const createdAt = msgResult.rows[0].created_at;

        // Create poll
        const pollResult = await db.query(`
            INSERT INTO polls (message_id, room_id, question, created_by, is_multiple_choice, is_anonymous)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [messageId, room_id, question, req.user.id, is_multiple_choice, is_anonymous]);
        
        const pollId = pollResult.rows[0].id;

        // Update message with poll_id
        await db.query('UPDATE messages SET poll_id = $1 WHERE id = $2', [pollId, messageId]);

        // Create options
        for (let i = 0; i < options.length; i++) {
            await db.query(`
                INSERT INTO poll_options (poll_id, option_text, option_order)
                VALUES ($1, $2, $3)
            `, [pollId, options[i], i]);
        }

        await db.query('COMMIT');

        // Update room last_message_at
        await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [room_id]);

        // Fetch complete poll data
        const pollData = await getPollWithOptions(pollId, req.user.id);

        // Get user info
        const userRes = await db.query('SELECT display_name, avatar_thumb_url FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const message = {
            id: messageId,
            room_id,
            user_id: req.user.id,
            type: 'poll',
            content: question,
            poll: pollData,
            created_at: createdAt,
            username: req.user.username,
            display_name: user.display_name,
            avatar_thumb_url: user.avatar_thumb_url
        };

        // Broadcast
        const io = req.app.get('io');
        io.to(`room:${room_id}`).emit('new_message', message);

        res.json(message);

    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Error creating poll:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Vote on a poll
router.post('/:pollId/vote', async (req, res) => {
    const { pollId } = req.params;
    const { optionIds } = req.body;
    
    try {
        // Get poll
        const pollRes = await db.query('SELECT * FROM polls WHERE id = $1', [pollId]);
        if (pollRes.rows.length === 0) {
            return res.status(404).json({ error: 'Poll not found' });
        }
        const poll = pollRes.rows[0];

        if (poll.is_closed) {
            return res.status(400).json({ error: 'Poll is closed' });
        }

        // Verify room membership
        const memberRes = await db.query(
            'SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2',
            [poll.room_id, req.user.id]
        );
        if (memberRes.rows.length === 0) {
            return res.status(403).json({ error: 'Not a member of this room' });
        }

        // Validate optionIds - can be empty array for unvoting
        if (!optionIds || !Array.isArray(optionIds)) {
            return res.status(400).json({ error: 'optionIds must be an array' });
        }

        // If not multiple choice, only allow one option (or zero for unvoting)
        if (!poll.is_multiple_choice && optionIds.length > 1) {
            return res.status(400).json({ error: 'Poll allows only one choice' });
        }

        // Remove existing votes
        await db.query('DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollId, req.user.id]);

        // Add new votes
        for (const optionId of optionIds) {
            await db.query(`
                INSERT INTO poll_votes (poll_id, option_id, user_id)
                VALUES ($1, $2, $3)
            `, [pollId, optionId, req.user.id]);
        }

        // Persist "Last Activity" for Sidebar
        // [FIX] On unvote, we should NOT insert a new message (which bumps the room to top).
        // Instead, we should DELETE the previous "Vote" activity messages for this user/poll.
        // This allows the room to revert to the *actual* last message (whether it's the poll itself or a newer text).
        // On Vote, we delete old vote markers and insert a set one to bump it.
        
        await db.query('DELETE FROM messages WHERE type = $1 AND user_id = $2 AND poll_id = $3', ['poll_vote', req.user.id, pollId]);

        const hasVoted = optionIds.length > 0;
        
        if (hasVoted) {
             await db.query(`
                INSERT INTO messages (room_id, user_id, content, type, poll_id, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
            `, [poll.room_id, req.user.id, 'Voted in poll', 'poll_vote', pollId]);
        }

        // Get updated poll data
        const pollData = await getPollWithOptions(pollId, req.user.id);
        
        // [FIX] Fetch authoritative last message for the room to update sidebar correctly in real-time
        const lastMsgRes = await db.query(`
            SELECT m.content, m.type, m.user_id, m.id, m.created_at, u.display_name as sender_name,
                   p.question as poll_question
            FROM messages m
            LEFT JOIN users u ON m.user_id = u.id
            LEFT JOIN polls p ON m.poll_id = p.id
            WHERE m.room_id = $1
            ORDER BY m.created_at DESC
            LIMIT 1
        `, [poll.room_id]);
        
        const lastMsg = lastMsgRes.rows[0];

        // Get user info for broadcast
        const userRes = await db.query('SELECT display_name, avatar_thumb_url FROM users WHERE id = $1', [req.user.id]);
        const voter = userRes.rows[0];

        // Broadcast vote update
        const io = req.app.get('io');
        const eventData = {
            pollId: parseInt(pollId),
            roomId: poll.room_id,
            messageId: poll.message_id,
            poll: pollData,
            voterId: req.user.id,
            voterName: voter.display_name,
            pollQuestion: poll.question,
            hasVoted: optionIds.length > 0, // true if voting, false if unvoting
            // [NEW] Authoritative last message for sidebar
            lastMessage: lastMsg ? {
                 content: lastMsg.content,
                 type: lastMsg.type,
                 sender_id: lastMsg.user_id,
                 sender_name: lastMsg.sender_name,
                 poll_question: lastMsg.poll_question
            } : null
        };
        
        io.to(`room:${poll.room_id}`).emit('poll_vote', eventData);

        res.json({ success: true, poll: pollData });

    } catch (err) {
        console.error('Error voting on poll:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Close a poll
router.post('/:pollId/close', async (req, res) => {
    const { pollId } = req.params;
    
    try {
        const pollRes = await db.query('SELECT * FROM polls WHERE id = $1', [pollId]);
        if (pollRes.rows.length === 0) {
            return res.status(404).json({ error: 'Poll not found' });
        }
        const poll = pollRes.rows[0];

        // Only creator can close
        if (poll.created_by !== req.user.id) {
            return res.status(403).json({ error: 'Only poll creator can close the poll' });
        }

        await db.query(`
            UPDATE polls SET is_closed = TRUE, closed_at = NOW() WHERE id = $1
        `, [pollId]);

        const pollData = await getPollWithOptions(pollId, req.user.id);

        // Broadcast
        const io = req.app.get('io');
        io.to(`room:${poll.room_id}`).emit('poll_closed', {
            pollId: parseInt(pollId),
            roomId: poll.room_id,
            poll: pollData
        });

        res.json({ success: true, poll: pollData });

    } catch (err) {
        console.error('Error closing poll:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get poll results
router.get('/:pollId', async (req, res) => {
    const { pollId } = req.params;
    
    try {
        const poll = await getPollWithOptions(pollId, req.user.id);
        if (!poll) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        res.json(poll);

    } catch (err) {
        console.error('Error fetching poll:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to get poll with options and vote counts
async function getPollWithOptions(pollId, currentUserId) {
    const pollRes = await db.query(`
        SELECT p.*, u.display_name as creator_name
        FROM polls p
        JOIN users u ON p.created_by = u.id
        WHERE p.id = $1
    `, [pollId]);
    
    if (pollRes.rows.length === 0) return null;
    const poll = pollRes.rows[0];

    // Get options with vote counts
    const optionsRes = await db.query(`
        SELECT 
            po.id, 
            po.option_text, 
            po.option_order,
            COUNT(pv.id) as vote_count
        FROM poll_options po
        LEFT JOIN poll_votes pv ON po.id = pv.option_id
        WHERE po.poll_id = $1
        GROUP BY po.id
        ORDER BY po.option_order
    `, [pollId]);

    // Get total votes
    const totalRes = await db.query(
        'SELECT COUNT(DISTINCT user_id) as total FROM poll_votes WHERE poll_id = $1',
        [pollId]
    );
    const totalVoters = parseInt(totalRes.rows[0].total || 0);

    // Get user's votes
    const userVotesRes = await db.query(
        'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
        [pollId, currentUserId]
    );
    const userVotes = userVotesRes.rows.map(r => r.option_id);

    // Get voters per option (if not anonymous)
    let votersByOption = {};
    if (!poll.is_anonymous) {
        const votersRes = await db.query(`
            SELECT pv.option_id, u.id as user_id, u.display_name, u.avatar_thumb_url
            FROM poll_votes pv
            JOIN users u ON pv.user_id = u.id
            WHERE pv.poll_id = $1
        `, [pollId]);
        
        for (const row of votersRes.rows) {
            if (!votersByOption[row.option_id]) {
                votersByOption[row.option_id] = [];
            }
            votersByOption[row.option_id].push({
                id: row.user_id,
                display_name: row.display_name,
                avatar_thumb_url: row.avatar_thumb_url
            });
        }
    }

    return {
        id: poll.id,
        question: poll.question,
        is_multiple_choice: poll.is_multiple_choice,
        is_anonymous: poll.is_anonymous,
        is_closed: poll.is_closed,
        created_by: poll.created_by,
        creator_name: poll.creator_name,
        total_voters: totalVoters,
        user_votes: userVotes,
        options: optionsRes.rows.map(opt => ({
            id: opt.id,
            text: opt.option_text,
            vote_count: parseInt(opt.vote_count),
            voters: votersByOption[opt.id] || []
        }))
    };
}

module.exports = router;

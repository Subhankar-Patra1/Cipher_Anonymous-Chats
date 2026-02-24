const express = require('express');
const db = require('./db');
const router = express.Router();
const { checkMessageLimit } = require('./utils/messageLimits');

// Middleware to check auth
const authenticate = (req, res, next) => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
    
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

// Create a new Todo list
router.post('/', async (req, res) => {
    const { room_id, title, items } = req.body; // items: string[]
    
    try {
        // [NEW] Enforce Instagram-style limit
        try {
            await checkMessageLimit(room_id, req.user.id, 'todo');
        } catch (e) {
            if (e.message === 'LIMIT_REACHED') {
                return res.status(403).json({ error: 'Invite sent. Wait for acceptance to send more messages.' });
            }
            if (e.message === 'FORBIDDEN_TYPE') {
                return res.status(403).json({ error: 'Text messages only until request is accepted.' });
            }
            throw e;
        }

        // Verify membership
        const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [room_id, req.user.id]);
        if (!memberRes.rows[0]) return res.status(403).json({ error: 'Not a member' });

        await db.query('BEGIN');

        // 1. Create Message Placeholder (Todo type)
        // We do this to get a message ID, but we might update it later with payload, or just store reference.
        // Actually, let's create the message first so we can link it.
        const msgRes = await db.query(`
            INSERT INTO messages (room_id, user_id, type, content)
            VALUES ($1, $2, 'todo', $3)
            RETURNING id, created_at
        `, [room_id, req.user.id, title || 'To-Do List']);
        const messageId = msgRes.rows[0].id;

        // 2. Create Todo
        const todoRes = await db.query(`
            INSERT INTO todos (room_id, created_by, title, message_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [room_id, req.user.id, title, messageId]);
        const todoId = todoRes.rows[0].id;

        // 3. Create Items
        if (items && Array.isArray(items)) {
            for (let i = 0; i < items.length; i++) {
                await db.query(`
                    INSERT INTO todo_items (todo_id, text, order_index)
                    VALUES ($1, $2, $3)
                `, [todoId, items[i], i]);
            }
        }

        await db.query('COMMIT');

        // Fetch full object to return/broadcast
        const fullTodo = await getTodoWithItems(todoId);
        
        // Broadcast via Socket (simulated via new_message event pattern)
        // Ideally we broadcast a 'new_message' that contains this todo data
        const io = req.app.get('io');
        
        // Construct the message payload similar to other message types
        const userRes = await db.query('SELECT display_name, avatar_thumb_url FROM users WHERE id = $1', [req.user.id]);
        const user = userRes.rows[0];

        const messagePayload = {
            id: messageId,
            room_id,
            user_id: req.user.id,
            type: 'todo',
            status: 'sent',
            content: title || 'To-Do List',
            todo: fullTodo,
            created_at: msgRes.rows[0].created_at,
            username: req.user.username,
            display_name: user.display_name,
            avatar_thumb_url: user.avatar_thumb_url
        };

        io.to(`room:${room_id}`).emit('new_message', messagePayload);
        
        // Update room last_message_at
        await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [room_id]);

        res.json(messagePayload);

    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Toggle Item Completion
router.put('/:todoId/items/:itemId', async (req, res) => {
    const { todoId, itemId } = req.params;
    const { is_completed } = req.body;

    try {
        const todoRes = await db.query('SELECT * FROM todos WHERE id = $1', [todoId]);
        if (!todoRes.rows[0]) return res.status(404).json({ error: 'Todo not found' });
        const todo = todoRes.rows[0];

        // Auth Check (Member of room)
        const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [todo.room_id, req.user.id]);
        if (!memberRes.rows[0]) return res.status(403).json({ error: 'Not a member' });

        await db.query(`
            UPDATE todo_items 
            SET is_completed = $1, 
                completed_by = $2, 
                completed_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END
            WHERE id = $3 AND todo_id = $4
        `, [is_completed, is_completed ? req.user.id : null, itemId, todoId]);

        const fullTodo = await getTodoWithItems(todoId);
        
        // Fetch updating user's name
        const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
        const updaterName = userRes.rows[0]?.display_name || 'Someone';

        // Broadcast update
        const io = req.app.get('io');
        io.to(`room:${todo.room_id}`).emit('todo_updated', {
            roomId: todo.room_id,
            todoId,
            messageId: todo.message_id,
            updaterId: req.user.id,
            updaterName: updaterName,
            todoTitle: todo.title,
            todo: fullTodo
        });

        // Update room last_message_at so it jumps to top
        await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [todo.room_id]);

        res.json(fullTodo);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper
async function getTodoWithItems(todoId) {
    const todoRes = await db.query('SELECT * FROM todos WHERE id = $1', [todoId]);
    if (!todoRes.rows[0]) return null;
    const todo = todoRes.rows[0];

    const itemsRes = await db.query(`
        SELECT ti.*, u.display_name as completed_by_name 
        FROM todo_items ti
        LEFT JOIN users u ON ti.completed_by = u.id
        WHERE ti.todo_id = $1
        ORDER BY ti.order_index ASC
    `, [todoId]);

    const creatorRes = await db.query('SELECT display_name FROM users WHERE id = $1', [todo.created_by]);

    return {
        ...todo,
        created_by_name: creatorRes.rows[0]?.display_name,
        items: itemsRes.rows
    };
}

module.exports = router;

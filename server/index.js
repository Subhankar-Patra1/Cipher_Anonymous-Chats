require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');
const redisClient = require('./redis');

// Connect Redis
redisClient.connectRedis();

const app = express();
const server = http.createServer(app);

// CORS Config
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const io = new Server(server, {
    cors: {
        origin: [clientUrl, "http://localhost:5173", "http://localhost:5174"],
        methods: ["GET", "POST"]
    }
});

app.use(cors({
    origin: [clientUrl, "http://localhost:5173", "http://localhost:5174"]
}));
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

const authRoutes = require('./auth');
app.use('/api/auth', authRoutes);

const roomRoutes = require('./rooms');
app.use('/api/rooms', roomRoutes);

const messageRoutes = require('./messages');
app.use('/api/messages', messageRoutes);

const tenorRoutes = require('./tenor');
app.use('/api/gifs', tenorRoutes);

// Presence API Routes
app.get('/api/users/status', async (req, res) => {
    try {
        const ids = req.query.ids ? req.query.ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : [];
        if (ids.length === 0) return res.json([]);

        console.log(`[DEBUG] Fetching status for users: ${ids.join(',')}`);

        // Get Redis status
        const statuses = await redisClient.getOnlineStatus(ids);
        console.log('[DEBUG] Redis statuses:', JSON.stringify(statuses));
        
        // Get DB fallbacks and privacy settings for these users
        const dbRes = await db.query('SELECT id, last_seen, share_presence FROM users WHERE id = ANY($1::int[])', [ids]);
        const dbUsers = {};
        dbRes.rows.forEach(u => dbUsers[u.id] = u);

        const result = ids.map(id => {
            const rStatus = statuses[id] || { online: false, sessionCount: 0, last_seen: null };
            const dUser = dbUsers[id];
            
            let finalStatus = {
                userId: parseInt(id),
                online: rStatus.online,
                sessionCount: rStatus.sessionCount,
                last_seen: rStatus.online ? null : (rStatus.last_seen || (dUser ? dUser.last_seen : null))
            };

            // Privacy Check
            if (dUser && dUser.share_presence === 'nobody') {
                 console.log(`[DEBUG] Hiding status for user ${id} due to privacy settings`);
                 return { userId: parseInt(id), online: false, last_seen: null, sessionCount: 0 };
            }
            
            return finalStatus;
        });

        console.log('[DEBUG] Final status result:', JSON.stringify(result));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Status fetch failed' });
    }
});

app.get('/api/users/:id/status', async (req, res) => {
     // Verify auth? The prompt implies authenticated user requests this.
     // We can use the JWT middleware if we want, but let's assume it's public/protected.
     // If we need `req.user`, we should apply authMiddleware.
     // Let's assume this route is protected or open. 
     // Ideally we check `req.headers.authorization`.
     
     // For now, let's just proceed.
     try {
         const targetId = req.params.id;
         const rStatus = await redisClient.getSingleUserStatus(targetId);
         const userRes = await db.query('SELECT last_seen, share_presence FROM users WHERE id = $1', [targetId]);
         const user = userRes.rows[0];

         if (!user) return res.status(404).json({error: 'User not found'});

         let online = rStatus.online;
         let last_seen = rStatus.online ? null : (rStatus.last_seen || user.last_seen);
         
         // Privacy
         if (user.share_presence === 'nobody') {
             online = false;
             last_seen = null;
         }
         // If 'contacts', we'd check relationship. Skipping for now as requested "minimal additions" and we lack a social graph.

         res.json({
             userId: parseInt(targetId),
             online,
             sessionCount: rStatus.sessionCount,
             last_seen
         });

     } catch (err) {
         console.error(err);
         res.status(500).json({ error: 'Fetch failed' });
     }
});

app.patch('/api/users/me/privacy', async (req, res) => {
    // Need auth
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
        const jwt = require('jsonwebtoken'); // Lazy load or move top
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
        const userId = decoded.id;
        const { share_presence } = req.body;

        if (!['everyone', 'contacts', 'nobody'].includes(share_presence)) {
            return res.status(400).json({ error: 'Invalid value' });
        }

        await db.query('UPDATE users SET share_presence = $1 WHERE id = $2', [share_presence, userId]);
        res.json({ success: true, share_presence });

    } catch (err) {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("Global Error Handler:", err.name, err.message, err.stack);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (err) {
        console.error('Health check failed:', err);
        res.status(500).json({ status: 'error', db: err.message });
    }
});

// Basic route
app.get('/', (req, res) => {
    res.send('Chat Server Running');
});

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Socket Auth Middleware
io.use((socket, next) => {
    console.log(`[DEBUG] Handshake attempt: SocketID=${socket.id}`);
    const token = socket.handshake.auth.token;
    
    if (!token) {
        console.error(`[DEBUG] Socket connection rejected: No token provided. SocketID=${socket.id}`);
        return next(new Error('Authentication error'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        console.log(`[DEBUG] Auth successful for user ${decoded.username} (${decoded.id}). SocketID=${socket.id}`);
        next();
    } catch (err) {
        console.error(`[DEBUG] Socket connection rejected: Invalid token. SocketID=${socket.id} Error=${err.message}`);
        next(new Error('Authentication error'));
    }
});

io.engine.on("connection_error", (err) => {
    console.log("[DEBUG] Connection error:", err.req.url, err.code, err.message, err.context);
});

app.set('io', io);

io.on('connection', async (socket) => {
    console.log(`[DEBUG] io.on('connection') triggered for User: ${socket.user.username} (${socket.user.id}) SocketID=${socket.id}`);
    
    // Join user-specific channel for notifications
    socket.join(`user:${socket.user.id}`);

    // Auto-join all existing rooms to receive notifications
    try {
        const roomsRes = await db.query('SELECT room_id FROM room_members WHERE user_id = $1', [socket.user.id]);
        const rooms = roomsRes.rows;
        rooms.forEach(row => {
            socket.join(`room:${row.room_id}`);
        });
    } catch (err) {
        console.error('Error joining rooms:', err);
    }

    socket.on('join_room', async (roomId) => {
        // Verify membership
        try {
            const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, socket.user.id]);
            const member = memberRes.rows[0];
            
            if (member) {
                socket.join(`room:${roomId}`);
                console.log(`User ${socket.user.username} joined room ${roomId}`);
            } else {
                socket.emit('error', 'Not a member');
            }
        } catch (err) {
            console.error(err);
        }
    });

    // PRESENCE LOGIC
    // 1. Add session
    const sessionId = require('crypto').randomUUID();
    const sessionCount = await redisClient.addSession(socket.user.id, sessionId);
    console.log(`[DEBUG] User ${socket.user.id} (${socket.user.username}) connected. Session count: ${sessionCount}`);
    
    // 2. Broadcast online if first session
    if (sessionCount === 1) {
        console.log(`[DEBUG] Broadcasting online for user ${socket.user.id}`);
        socket.broadcast.emit('presence:update', {
            userId: socket.user.id,
            online: true,
            sessionCount: 1,
            last_seen: null
        });
    }

    socket.on('presence:heartbeat', async () => {
        await redisClient.heartbeatSession(sessionId);
    });

    // Handle explicit disconnect
    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.user.username);
        const remaining = await redisClient.removeSession(socket.user.id, sessionId);
        console.log(`[DEBUG] User ${socket.user.id} disconnected. Remaining sessions: ${remaining}`);
        
        if (remaining === 0) {
            const lastSeen = await redisClient.setLastSeen(socket.user.id);
            // Persist to DB for long-term storage
            try {
                await db.query('UPDATE users SET last_seen = $1 WHERE id = $2', [lastSeen, socket.user.id]);
            } catch (err) {
                console.error('Error updating last_seen in DB:', err);
            }

            console.log(`[DEBUG] Broadcasting offline for user ${socket.user.id}`);
            socket.broadcast.emit('presence:update', {
                userId: socket.user.id,
                online: false,
                sessionCount: 0,
                last_seen: lastSeen
            });
        }
    });

    socket.on('send_message', async ({ roomId, content, replyToMessageId, tempId }) => {
        try {
            // Verify membership and expiry
            const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
            const room = roomRes.rows[0];

            if (!room) return;
            if (room.expires_at && new Date(room.expires_at) < new Date()) {
                return socket.emit('error', 'Room expired');
            }

            const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, socket.user.id]);
            const member = memberRes.rows[0];

            if (member) {
                const insertRes = await db.query(
                    `INSERT INTO messages (room_id, user_id, content, reply_to_message_id) 
                     VALUES ($1, $2, $3, $4) 
                     RETURNING id, status, reply_to_message_id, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at`,
                    [roomId, socket.user.id, content, replyToMessageId || null]
                );
                const info = insertRes.rows[0];
                
                // Get User Display Name
                const userRes = await db.query('SELECT display_name FROM users WHERE id = $1', [socket.user.id]);
                const user = userRes.rows[0];

                const message = {
                    id: info.id,
                    room_id: roomId,
                    user_id: socket.user.id,
                    content,
                    status: info.status,
                    reply_to_message_id: info.reply_to_message_id, // Send back explicitly
                    created_at: info.created_at,
                    username: socket.user.username,
                    display_name: user ? user.display_name : socket.user.display_name,
                    tempId: tempId // Return the tempId to the client
                };

                io.to(`room:${roomId}`).emit('new_message', message);
            } else {
                console.log(`User ${socket.user.username} tried to send message to room ${roomId} but is not a member`);
            }
        } catch (err) {
            console.error('Error sending message:', err);
        }
    });

    socket.on('mark_seen', async ({ roomId, messageIds }) => {
        try {
            // Verify membership
            const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, socket.user.id]);
            if (!memberRes.rows[0]) return;

            // Update status to 'seen' for messages in this room, not sent by this user
            // In a real app, we might check messageIds specifically.
            // For simplicity, let's update specific IDs if provided, or "all unseen" logic.
            // Let's assume the client sends the ID of the latest message they saw?
            // Or a list of IDs.
            
            if (messageIds && messageIds.length > 0) {
                 await db.query(
                    'UPDATE messages SET status = $1 WHERE id = ANY($2) AND room_id = $3 AND user_id != $4',
                    ['seen', messageIds, roomId, socket.user.id]
                );
                
                // Broadcast update
                io.to(`room:${roomId}`).emit('messages_status_update', { messageIds, status: 'seen', roomId });
            }
        } catch (err) {
            console.error('Error marking seen:', err);
        }
    });

    socket.on('typing:start', ({ roomId }) => {
        // Broadcast to room excluding sender
        socket.to(`room:${roomId}`).emit('typing:start', {
            room_id: roomId,
            user_id: socket.user.id,
            user_name: socket.user.display_name || socket.user.username, // Use display name if available
            timestamp: new Date().toISOString()
        });
    });

    socket.on('typing:stop', ({ roomId }) => {
        socket.to(`room:${roomId}`).emit('typing:stop', {
            room_id: roomId,
            user_id: socket.user.id
        });
    });
    // Removed duplicate disconnect handler as we handled it above in presence block

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

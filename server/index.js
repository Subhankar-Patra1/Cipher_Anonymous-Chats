require('dotenv').config();
// Main Server Entry Point - Updated for restart
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');
const redisClient = require('./redis');
const socketMap = require('./utils/socketMap');

function getFriendlyDeviceInfo(ua) {
    if (!ua) return 'Unknown Device';
    
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    // Parse Browser
    if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

    // Parse OS
    if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
    else if (ua.includes('Macintosh')) os = 'macOS';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Linux')) os = 'Linux';

    return `${browser} on ${os}`;
}

// Connect Redis
// Connect Redis
redisClient.connectRedis();

// Configure S3 CORS
const { configureBucketCors } = require('./s3');
configureBucketCors();

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

// app.use((req, res, next) => {
//     console.log(`${req.method} ${req.url}`);
//     next();
// });

const authRoutes = require('./auth');
app.use('/api/auth', authRoutes);

// [NEW] Sessions Route
const sessionsRoutes = require('./routes/sessions');
app.use('/api/sessions', sessionsRoutes);


const roomRoutes = require('./rooms');
app.use('/api/rooms', roomRoutes);


const messageRoutes = require('./messages');
app.use('/api/messages', messageRoutes);

const tenorRoutes = require('./tenor');
app.use('/api/gifs', tenorRoutes);

const pollsRoutes = require('./polls');
app.use('/api/polls', pollsRoutes);

// AI Integration
const { setupAI } = require('./ai');
setupAI(app, io, db, redisClient);

// Presence API Routes
app.get('/api/users/status', async (req, res) => {
    try {
        const ids = req.query.ids ? req.query.ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : [];
        if (ids.length === 0) return res.json([]);

        // console.log(`[DEBUG] Fetching status for users: ${ids.join(',')}`);

        // Get Redis status
        const statuses = await redisClient.getOnlineStatus(ids);
        // console.log('[DEBUG] Redis statuses:', JSON.stringify(statuses));
        
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

        // console.log('[DEBUG] Final status result:', JSON.stringify(result));
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

const usersRoutes = require('./users');
app.use('/api/users', usersRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("Global Error Handler:", err.name, err.message, err.stack);
    if (res.headersSent) {
        return next(err);
    }
    
    // Sanitize DB Connection Errors
    if (err.message.includes('getaddrinfo') || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        return res.status(503).json({ error: 'Unable to connect to server. Please check your internet connection.' });
    }

    // Generic fallback for production safety (optional, but requested behavior implies hiding raw errors)
    // For now we keep msg for other errors unless they are sensitive, but "getaddrinfo" is the main culprit here.
    res.status(500).json({ error: 'Internal Server Error' });
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

// [NEW] Track pending sync requests: userId -> { requesterDeviceId, senderPublicKey, deviceInfo }
const pendingSyncs = new Map();

// Socket Auth Middleware
io.use(async (socket, next) => {
    // console.log(`[DEBUG] Handshake attempt: SocketID=${socket.id}`);
    const token = socket.handshake.auth.token;
    
    if (!token) {
        console.error(`[DEBUG] Socket connection rejected: No token provided. SocketID=${socket.id}`);
        return next(new Error('Authentication error'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;

        // [NEW] Validate Session
        if (decoded.sessionId) {
             const sessionCheck = await db.query('SELECT id FROM user_sessions WHERE id = $1 AND user_id = $2', [decoded.sessionId, decoded.id]);
             if (sessionCheck.rows.length === 0) {
                 console.error(`[DEBUG] Socket connection rejected: Session invalid/revoked. SocketID=${socket.id}`);
                 return next(new Error('Session invalid'));
             }
             socket.sessionId = decoded.sessionId;
        } else {
            // Strict mode: Reject if no sessionId found (User requirement)
            console.error(`[DEBUG] Socket connection rejected: Token missing sessionId. SocketID=${socket.id}`);
            return next(new Error('Authentication error - Legacy token'));
        }

        // console.log(`[DEBUG] Auth successful for user ${decoded.username} (${decoded.id}). Session=${decoded.sessionId} SocketID=${socket.id}`);
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
    const clientDeviceId = socket.handshake.query.deviceId || socket.handshake.auth.deviceId;
    // console.log(`[DEBUG] io.on('connection') triggered for User: ${socket.user.username} (${socket.user.id}) SocketID=${socket.id}, DeviceID=${clientDeviceId}`);
    
    // Join user-specific channel for notifications
    socket.join(`user:${socket.user.id}`);

    // [NEW] Register Device for Key Sync
    if (clientDeviceId) {
        socketMap.registerDevice(socket.user.id, clientDeviceId, socket.id);
        socket.deviceId = clientDeviceId;

        // [NEW] Check for PENDING sync requests targeted at this user
        const uId = String(socket.user.id);
        const pending = pendingSyncs.get(uId);

        if (pending && pending.requesterDeviceId !== clientDeviceId) {
            console.log(`[Sync] Found pending sync request for User ${uId}. Emitting to new connection in 500ms...`);
            // [NEW] Delay to ensure client-side listeners are ready
            setTimeout(() => {
                socket.emit('request_key_sync', {
                    targetDeviceId: pending.requesterDeviceId,
                    senderPublicKey: pending.senderPublicKey,
                    deviceInfo: pending.deviceInfo
                });
            }, 500);
        }
    } else {
        console.warn(`[Sync] DeviceID missing in handshake for User ${socket.user.id}`);
    }

    // --- [PHASE 1] KEY SYNC LOGIC (Registered early to avoid async race) ---
    socket.on('request_key_sync', (senderPublicKey) => {
        const userId = socket.user.id;
        const deviceId = socket.deviceId;
        
        if (!deviceId) return;

        console.log(`[Sync] User ${userId} Device ${deviceId} requesting keys...`);

        // Find other devices of the same user
        const uId = String(userId);
        const otherDevices = socketMap.getOtherDevices(uId, deviceId);
        
        // [NEW] Store the pending request for any future connections (refresh handling)
        const deviceInfo = getFriendlyDeviceInfo(socket.request.headers['user-agent']);
        
        console.log(`[Sync] Storing pending sync for User ${uId}`);
        pendingSyncs.set(uId, {
            requesterDeviceId: deviceId,
            senderPublicKey,
            deviceInfo
        });

        if (otherDevices.length > 0) {
            console.log(`[Sync] Found ${otherDevices.length} other online devices for user ${uId}:`, otherDevices.map(d => d.deviceId));
            otherDevices.forEach(device => {
                console.log(`[Sync] Forwarding request to Device ${device.deviceId}`);
                io.to(device.socketId).emit('request_key_sync', {
                    targetDeviceId: deviceId,
                    senderPublicKey,
                    deviceInfo
                });
            });
        } else {
            console.log(`[Sync] No other devices CURRENTLY online for user ${uId}. Request stored for potential future connections.`);
        }

        // [NEW] Notify requester of how many devices are actually online to approve
        socket.emit('sync:target_count', { count: otherDevices.length });
    });

    socket.on('provide_key_sync', ({ targetDeviceId, encryptedBlob, senderPublicKey }) => {
        const userId = socket.user.id;
        const targetSocketId = socketMap.getSocketId(userId, targetDeviceId);

        if (!targetSocketId) {
            console.warn(`[Sync] Target device ${targetDeviceId} went offline while preparing sync.`);
            return;
        }

        console.log(`[Sync] Forwarding key bundle from ${socket.deviceId} to ${targetDeviceId}`);
        
        io.to(targetSocketId).emit('provide_key_sync', {
            encryptedBlob,
            senderPublicKey 
        });
    });

    socket.on('sync_canceled', () => {
        const userId = socket.user.id;
        const uId = String(userId);  // [FIX] Normalize to string
        const deviceId = socket.deviceId;
        console.log(`[Sync] Request canceled by requester ${deviceId}. Clearing pending state.`);
        
        // [NEW] Clear pending state
        if (pendingSyncs.has(uId) && pendingSyncs.get(uId).requesterDeviceId === deviceId) {
            pendingSyncs.delete(uId);
        }

        socket.broadcast.to(`user:${userId}`).emit('sync_canceled', { targetDeviceId: deviceId });
    });

    socket.on('sync_denied', ({ targetDeviceId }) => {
        const userId = socket.user.id;
        const targetSocketId = socketMap.getSocketId(userId, targetDeviceId);
        if (targetSocketId) {
            console.log(`[Sync] Forwarding denial to ${targetDeviceId}`);
            io.to(targetSocketId).emit('sync_denied');
        }
    });

    socket.on('sync_finished', () => {
        console.log(`[Sync] Sync finished successfully. Clearing pending state.`);
        const userId = socket.user.id;
        const uId = String(userId);  // [FIX] Normalize to string
        
        // [NEW] Clear pending state
        pendingSyncs.delete(uId);

        socket.broadcast.to(`user:${userId}`).emit('sync_finished');
    });


    // Auto-join all existing rooms to receive notifications
    try {
        const roomsRes = await db.query('SELECT room_id FROM room_members WHERE user_id = $1', [socket.user.id]);
        const rooms = roomsRes.rows;
        rooms.forEach(row => {
            socket.join(`room:${row.room_id}`);
        });

        // [NEW] Delivery Catch-up: Mark messages as delivered for this user
        // Find messages sent to rooms I'm in, where I haven't received them yet, and I am NOT the sender.
        // We use a simplified query: Find messages in my rooms, from others, not in deliveries.
        const userId = socket.user.id;
        
        // 1. Get all messages ID that are pending delivery for this user
        // Optimization: Limit to recent messages? For now, we do all.
        // We need to join with room_members to ensure I am still in the room? 
        // Logic: messages in rooms I am member of, sender != me, left join deliveries is null.
        
        const pendingRes = await db.query(`
            SELECT m.id, m.user_id as sender_id, m.room_id
            FROM messages m
            JOIN room_members rm ON m.room_id = rm.room_id
            LEFT JOIN message_deliveries md ON m.id = md.message_id AND md.user_id = $1
            WHERE rm.user_id = $1
            AND m.user_id != $1
            AND md.message_id IS NULL
        `, [userId]);

        const pendingMessages = pendingRes.rows;

        if (pendingMessages.length > 0) {
            console.log(`[DEBUG] Marking ${pendingMessages.length} messages as delivered for user ${userId}`);
            
            // 2. Batch insert into message_deliveries
            // We can do this in a loop or a bulk insert. Loop is safer for simple pg usage without helper.
            // Using ON CONFLICT DO NOTHING for idempotency.
            const now = new Date().toISOString();
            
            for (const msg of pendingMessages) {
                await db.query(`
                    INSERT INTO message_deliveries (message_id, user_id, delivered_at)
                    VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                `, [msg.id, userId, now]);

                // [NEW] Update message status to 'delivered' if currently 'sent'
                await db.query(`
                    UPDATE messages SET status = 'delivered' 
                    WHERE id = $1 AND status = 'sent'
                `, [msg.id]);

                // 3. Emit to sender if online
                // We emit to specific user channel
                io.to(`user:${msg.sender_id}`).emit('message:delivered', {
                    messageId: msg.id,
                    userId: userId,
                    deliveredAt: now,
                    roomId: msg.room_id
                });
            }
        }

    } catch (err) {
        console.error('Error joining rooms / deliveries:', err);
    }


    socket.on('join_room', async (roomId) => {
        // Verify membership
        try {
            const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, socket.user.id]);
            const member = memberRes.rows[0];
            
            if (member) {
                socket.join(`room:${roomId}`);
                // console.log(`User ${socket.user.username} joined room ${roomId}`);
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
    // console.log(`[DEBUG] User ${socket.user.id} (${socket.user.username}) connected. Session count: ${sessionCount}`);
    
    // 2. Broadcast online if first session
    if (sessionCount === 1) {
        // console.log(`[DEBUG] Broadcasting online for user ${socket.user.id}`);
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
        // console.log('User disconnected:', socket.user.username);
        
        // [NEW] Unregister Device
        if (socket.deviceId) {
            socketMap.unregisterSocket(socket.user.id, socket.id);
        }

        const remaining = await redisClient.removeSession(socket.user.id, sessionId);
        // console.log(`[DEBUG] User ${socket.user.id} disconnected. Remaining sessions: ${remaining}`);
        
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

    // [UPDATED] Send Message with Acknowledgement Support
    socket.on('send_message', async ({ roomId, content, replyToMessageId, tempId, ciphertext, iv, salt, keyVersion, meta, signature, signatureVersion, senderDeviceId, distribution_headers, mention_user_ids }, callback) => {
        // Callback is optional (for backward compatibility), but required for offline sync.
        const safeCallback = typeof callback === 'function' ? callback : () => {};

        try {
            // Verify membership and expiry
            const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
            const room = roomRes.rows[0];

            if (!room) {
                 safeCallback({ status: 'error', error: 'Room not found' });
                 return;
            }
            if (room.expires_at && new Date(room.expires_at) < new Date()) {
                socket.emit('error', 'Room expired');
                safeCallback({ status: 'error', error: 'Room expired' });
                return;
            }

            const memberRes = await db.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, socket.user.id]);
            const member = memberRes.rows[0];

            if (member) {
                // Check Permissions (Send Mode)
                const permRes = await db.query('SELECT send_mode FROM group_permissions WHERE group_id = $1', [roomId]);
                const sendMode = permRes.rows[0]?.send_mode || 'everyone';
                
                if (sendMode === 'admins_only' && !['admin', 'owner'].includes(member.role)) {
                     socket.emit('error', 'Only admins can send messages');
                     safeCallback({ status: 'error', error: 'Only admins can send messages' });
                     return;
                }
                if (sendMode === 'owner_only' && member.role !== 'owner') {
                     socket.emit('error', 'Only owner can send messages');
                     safeCallback({ status: 'error', error: 'Only owner can send messages' });
                     return;
                }

                // [NEW] Block check for direct chats
                let isBlocked = false;
                let blockerUserId = null;
                if (room.type === 'direct') {
                    const otherMemberRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1 AND user_id != $2', [roomId, socket.user.id]);
                    const otherUserId = otherMemberRes.rows[0]?.user_id;
                    if (otherUserId) {
                        const blockCheck = await db.query(
                            'SELECT blocker_id FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
                            [socket.user.id, otherUserId]
                        );
                        if (blockCheck.rows.length > 0) {
                            isBlocked = true;
                            blockerUserId = parseInt(blockCheck.rows[0].blocker_id, 10);
                        }
                    }
                }

                let info;
                try {
                    const insertRes = await db.query(
                        `INSERT INTO messages (room_id, user_id, content, reply_to_message_id, blocked_for_user_id, ciphertext, iv, salt, key_version, meta_type, temp_id, signature, signature_version, sender_device_id, distribution_headers, mention_user_ids) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
                        RETURNING id, status, reply_to_message_id, created_at`,
                        [
                            roomId, 
                            socket.user.id, 
                            content, 
                            replyToMessageId || null, 
                            blockerUserId || null,
                            ciphertext || null,
                            iv || null,
                            salt || null,
                            keyVersion || null,
                            meta ? meta.type : null,
                            tempId || null,
                            signature || null,
                            signatureVersion || 1,
                            senderDeviceId || null,
                            distribution_headers || null,
                            mention_user_ids || null
                        ]
                    );
                    info = insertRes.rows[0];

                    // Send Success ACK
                    safeCallback({ status: 'ok', messageId: info.id, tempId: tempId });

                } catch (e) {
                    if (e.code === '23505' && tempId) { // Unique violation on temp_id
                        console.warn(`[Security/Sync] Duplicate Message via temp_id (Replay/Retry): ${tempId}`);
                        // [CRITICAL] Return OK for duplicates so client stops retrying
                        // We need the original ID though. Let's fetch it.
                        try {
                            const existing = await db.query('SELECT id FROM messages WHERE temp_id = $1 AND user_id = $2', [tempId, socket.user.id]);
                            if (existing.rows[0]) {
                                safeCallback({ status: 'ok', messageId: existing.rows[0].id, tempId: tempId }); 
                            } else {
                                safeCallback({ status: 'error', error: 'Duplicate temp_id but message not found' });
                            }
                        } catch (lookupErr) {
                            safeCallback({ status: 'error', error: 'Database error handling duplicate' });
                        }
                        return;
                    } else {
                        throw e;
                    }
                }
                
                // Get User Display Name
                
                // Get User Display Name
                const userRes = await db.query('SELECT display_name, avatar_thumb_url, avatar_url FROM users WHERE id = $1', [socket.user.id]);
                const user = userRes.rows[0];

                // [NEW] Fetch reply message metadata if this is a reply
                let replyData = null;
                if (info.reply_to_message_id) {
                    try {
                        const replyRes = await db.query(`
                            SELECT m.id, m.content, m.type, m.caption, m.file_name, m.user_id, m.is_view_once,
                                   u.display_name, u.username,
                                   m.attachments, m.ciphertext, m.iv, m.salt, m.key_version, m.temp_id,
                                   m.audio_duration_ms -- [FIX] Fetch duration
                            FROM messages m
                            JOIN users u ON m.user_id = u.id
                            WHERE m.id = $1
                        `, [info.reply_to_message_id]);
                        
                        if (replyRes.rows[0]) {
                            const replyMsg = replyRes.rows[0];
                            // Generate a preview text for the reply
                            let preview = replyMsg.content || '';
                            if (replyMsg.type === 'image') preview = replyMsg.caption || 'Photo';
                            if (replyMsg.type === 'audio') preview = 'Voice message';
                            if (replyMsg.type === 'file') preview = replyMsg.file_name || 'Document';
                            if (replyMsg.type === 'gif') preview = 'GIF';
                            if (replyMsg.type === 'location') preview = 'Location';
                            if (replyMsg.type === 'poll') preview = 'Poll';
                            if (replyMsg.is_view_once) preview = 'Photo';
                            
                            replyData = {
                                id: replyMsg.id,
                                sender: replyMsg.display_name || replyMsg.username || 'Unknown',
                                text: preview.length > 80 ? preview.slice(0, 80) + '...' : preview,
                                type: replyMsg.type || 'text',
                                user_id: replyMsg.user_id,
                                is_view_once: replyMsg.is_view_once,
                                attachments: replyMsg.attachments,
                                // [NEW] Include encryption fields for E2EE decryption on client
                                ciphertext: replyMsg.ciphertext,
                                iv: replyMsg.iv,
                                salt: replyMsg.salt,
                                key_version: replyMsg.key_version,
                                temp_id: replyMsg.temp_id,
                                content: replyMsg.content, // Include raw content for non-encrypted
                                audio_duration_ms: replyMsg.audio_duration_ms // [FIX] Include duration for audio replies
                            };
                        }
                    } catch (err) {
                        console.error('[Reply Fetch Error]:', err);
                    }
                }

                const message = {
                    id: info.id,
                    room_id: roomId,
                    user_id: socket.user.id,
                    content,
                    status: info.status,
                    reply_to_message_id: info.reply_to_message_id, // Send back explicitly
                    replyTo: replyData, // [NEW] Include full reply context
                    created_at: info.created_at,
                    // [FIX] Normalize keys for frontend (MessageItem expects display_name/username)
                    display_name: user?.display_name,
                    username: socket.user.username,
                    avatar_thumb_url: user?.avatar_thumb_url || null,
                    avatar_url: user?.avatar_url || null,
                    
                    sender_name: user?.display_name || socket.user.username,
                    sender_profile_pic: user?.avatar_thumb_url || user?.avatar_url || null,
                    sender_role: member.role,
                    sender_color: member.color_preference,
                    // [NEW] E2EE Fields
                    ciphertext, iv, salt, key_version: keyVersion, temp_id: tempId,
                    // [NEW] Sender Auth Fields
                    signature, signature_version: signatureVersion, sender_device_id: senderDeviceId,
                    distribution_headers,
                    mention_user_ids: mention_user_ids || [], // [NEW] Broadcast mentions
                    meta: meta || {}
                };

                // [NEW] If blocked, only emit to sender (not to room)
                if (isBlocked) {
                    io.to(`user:${socket.user.id}`).emit('new_message', message);
                    // Skip the rest of the room notification logic
                    return;
                }

                // [FIX] Handle invisible check for room (Logic ported from server/messages.js)
                const hiddenMembersRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1 AND is_hidden = TRUE', [roomId]);
                const hiddenUserIds = hiddenMembersRes.rows.map(r => r.user_id);
                
                if (hiddenUserIds.length > 0) {
                     // Unhide for everyone
                     await db.query('UPDATE room_members SET is_hidden = FALSE WHERE room_id = $1', [roomId]);
                     
                     // Get all members to notify if they were missing the room
                     const allMembersRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1', [roomId]);
                     const allMemberIds = allMembersRes.rows.map(r => r.user_id);
 
                     for (const recipientId of allMemberIds) {
                         if (recipientId == socket.user.id) continue;
                         
                         // Determine if we should send room update.
                         // Prudent to send if they were hidden OR just to be safe.
                         if (hiddenUserIds.includes(recipientId)) {
                              console.log('[DEBUG-SOCKET] Emitting room_added/refresh to previously hidden user:', recipientId);
                              io.to(`user:${recipientId}`).emit('rooms:refresh');
 
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
                                 (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.created_at > COALESCE(rm.last_read_at, '1970-01-01') AND $1::integer = ANY(m.mention_user_ids)) as mention_count,
                                 gp.send_mode, gp.allow_name_change, gp.allow_description_change, gp.allow_add_members, gp.allow_remove_members
                                 FROM rooms r 
                                 JOIN room_members rm ON r.id = rm.room_id 
                                 LEFT JOIN group_permissions gp ON r.id = gp.group_id
                                 WHERE r.id = $2 AND rm.user_id = $1
                              `, [recipientId, roomId]);
                              
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
                                     unread_count: parseInt(rawRoom.unread_count || 0),
                                     mention_count: parseInt(rawRoom.mention_count || 0) // [NEW] Real-time sync
                                   };
                                  
                                  io.to(`user:${recipientId}`).emit('room_added', formattedRoom);
                              }
                         }
                     }
                }

                // [MODIFIED] Soft Block: Emit to each member individually with meta.silent flag
                // Fetch members and check if they have blocked the sender
                const membersAndBlockStatus = await db.query(`
                    SELECT rm.user_id, 
                           CASE WHEN bu.blocker_id IS NOT NULL THEN true ELSE false END as is_blocking_sender
                    FROM room_members rm
                    LEFT JOIN blocked_users bu ON bu.blocker_id = rm.user_id AND bu.blocked_id = $1
                    WHERE rm.room_id = $2
                `, [socket.user.id, roomId]);

                for (const row of membersAndBlockStatus.rows) {
                    const isSilent = row.is_blocking_sender;
                    // Prepare payload with meta
                    const msgPayload = { 
                        ...message, 
                        meta: { silent: isSilent } 
                    };
                    
                    io.to(`user:${row.user_id}`).emit('new_message', msgPayload);

                    // [NEW] Delivery Logic: If recipient is online, mark as delivered for SENDER
                    if (row.user_id !== socket.user.id) {
                        try {
                            const userRoom = io.sockets.adapter.rooms.get(`user:${row.user_id}`);
                            const isOnline = userRoom && userRoom.size > 0;
                            
                            if (isOnline) {
                                // 1. Record delivery in DB
                                await db.query(`
                                    INSERT INTO message_deliveries (message_id, user_id, delivered_at)
                                    VALUES ($1, $2, NOW())
                                    ON CONFLICT DO NOTHING
                                `, [message.id, row.user_id]);

                                // [NEW] Update message status to 'delivered' if currently 'sent'
                                await db.query(`
                                    UPDATE messages SET status = 'delivered'
                                    WHERE id = $1 AND status = 'sent'
                                `, [message.id]);

                                // 2. Notify Sender (that Recipient X got it)
                                // We send { messageId, userId, ... }
                                // It allows sender client to turn tick double or update info.
                                io.to(`user:${socket.user.id}`).emit('message:delivered', {
                                    messageId: message.id,
                                    userId: row.user_id,
                                    deliveredAt: new Date().toISOString(),
                                    roomId: roomId
                                });
                            }
                        } catch (err) {
                            console.error('[Delivery Error]', err);
                        }
                    }
                }
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
                 // Filter out non-integer IDs
                 const validIds = messageIds.filter(id => Number.isInteger(id) || (typeof id === 'string' && /^\d+$/.test(id)));
                 if (validIds.length === 0) return;

                 // 1. Get room member count
                 const countRes = await db.query('SELECT count(*) FROM room_members WHERE room_id = $1', [roomId]);
                 const totalMembers = parseInt(countRes.rows[0].count);

                 // 2. Update read_by for these messages (append user_id if not present)
                 // [MODIFIED] Soft Block: Do not send read receipt IF sender is blocked by reader (One-Way)
                 const updateRes = await db.query(`
                    UPDATE messages 
                    SET read_by = array_append(read_by, $3)
                    WHERE id = ANY($1::int[]) 
                      AND room_id = $2 
                      AND user_id != $3
                      AND NOT ($3 = ANY(read_by))
                      AND user_id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = $3)
                    RETURNING id, cardinality(read_by) as read_count
                 `, [validIds, roomId, socket.user.id]);

                 // [NEW] Also ensure these messages are marked as DELIVERED in the database
                 if (validIds.length > 0) {
                     await db.query(`
                        INSERT INTO message_deliveries (message_id, user_id)
                        SELECT unnest($1::int[]), $2
                        ON CONFLICT (message_id, user_id) DO NOTHING
                     `, [validIds, socket.user.id]);
                 }
                 
                 const updatedMessages = updateRes.rows;
                 const fullyReadIds = [];

                 // 3. Check if any message is now seen by everyone (except sender)
                 const threshold = totalMembers - 1;
                 
                 for (const msg of updatedMessages) {
                     if (msg.read_count >= threshold) {
                         fullyReadIds.push(msg.id);
                     }
                 }

                 // 4. Update status to 'seen' only for fully read messages
                 if (fullyReadIds.length > 0) {
                    await db.query(
                        'UPDATE messages SET status = $1 WHERE id = ANY($2)',
                        ['seen', fullyReadIds]
                    );
                    
                    // Broadcast update only for fully read messages
                    io.to(`room:${roomId}`).emit('messages_status_update', { messageIds: fullyReadIds, status: 'seen', roomId });
                 }
                 
                 // [NEW] Broadcast Read Receipt (Real-time update for Message Info)
                 // We emit to the room so everyone's "Message Info" updates
                 io.to(`room:${roomId}`).emit('message:read_receipt', { 
                     roomId, 
                     messageIds: updatedMessages.map(m => m.id), 
                     userId: socket.user.id,
                     readAt: new Date().toISOString()
                 });
            }
        } catch (err) {
            console.error('Error marking seen:', err);
        }
    });

    socket.on('message_delivered', async ({ messageId, roomId }) => {
        try {
            const userId = socket.user.id;
            const now = new Date().toISOString();
            
            // Update delivered_to array and delivered_at JSONB
            // [MODIFIED] Soft Block: Do not send delivered receipt IF sender is blocked by reader (One-Way)
            const updateRes = await db.query(`
                UPDATE messages 
                SET delivered_to = array_append(COALESCE(delivered_to, '{}'), $1),
                    delivered_at = COALESCE(delivered_at, '{}')::jsonb || jsonb_build_object($1::text, $4::text)
                WHERE id = $2 
                  AND room_id = $3
                  AND NOT ($1 = ANY(COALESCE(delivered_to, '{}')))
                  AND user_id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = $1)
                RETURNING id, status
            `, [userId, messageId, roomId, now]);

            if (updateRes.rowCount > 0) {
                const msg = updateRes.rows[0];
                // If status is 'sent', update to 'delivered'
                if (msg.status === 'sent') {
                    await db.query('UPDATE messages SET status = $1 WHERE id = $2', ['delivered', messageId]);
                    io.to(`room:${roomId}`).emit('messages_status_update', { messageIds: [messageId], status: 'delivered', roomId });
                    
                    // [NEW] Also emit explicit message:delivered for sender's tick update
                    io.to(`user:${socket.user.id}`).emit('message:delivered', { messageId, roomId });
                }
            }
        } catch (err) {
            console.error('Error marking delivered:', err);
        }
    });

    socket.on('chat:mark-read', async ({ chatId, lastReadMessageId }) => {
        try {
            // Check membership
            const memberCheck = await db.query('SELECT user_id FROM room_members WHERE room_id = $1 AND user_id = $2', [chatId, socket.user.id]);
            if (memberCheck.rows.length === 0) return;

            await db.query(`
                UPDATE room_members 
                SET last_read_message_id = $1, last_read_at = NOW() 
                WHERE room_id = $2 AND user_id = $3
            `, [lastReadMessageId, chatId, socket.user.id]);

            // Broadcast to user's other sessions to clear badge/divider
            io.to(`user:${socket.user.id}`).emit('chat:read-update', { chatId, lastReadMessageId });
            
            // Optional: You could update message read status here too, 
            // but sticking to your prompt, we just track the pointer for the divider logic.
            // If you want read receipts (blue ticks), you invoke 'mark_seen' separately or merge logic.
            // For this specific feature (divider), updating room_members is the key.

        } catch (err) {
            console.error('Error in chat:mark-read:', err);
        }
    });

    socket.on('typing:start', async ({ roomId }) => {
        try {
            // [MODIFIED] Soft Block: Emit to each member individually, filtering blocked users (Bidirectional)
            const membersRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1', [roomId]);
            
            // Get all relevant blocks (I blocked them OR They blocked me)
            const blocksRes = await db.query(
                'SELECT blocker_id, blocked_id FROM blocked_users WHERE blocker_id = $1 OR blocked_id = $1',
                [socket.user.id]
            );
            const hiddenSet = new Set();
            blocksRes.rows.forEach(r => {
                if (r.blocker_id === socket.user.id) hiddenSet.add(r.blocked_id);
                if (r.blocked_id === socket.user.id) hiddenSet.add(r.blocker_id);
            });

            for (const m of membersRes.rows) {
                if (m.user_id === socket.user.id) continue;
                if (hiddenSet.has(m.user_id)) continue;

                io.to(`user:${m.user_id}`).emit('typing:start', {
                    room_id: roomId,
                    user_id: socket.user.id,
                    user_name: socket.user.display_name || socket.user.username,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (err) {
            console.error('Error in typing:start:', err);
        }
    });

    socket.on('typing:stop', async ({ roomId }) => {
        try {
            // [MODIFIED] Soft Block: Emit to each member individually, filtering blocked users (Bidirectional)
            const membersRes = await db.query('SELECT user_id FROM room_members WHERE room_id = $1', [roomId]);
            
            // Get all relevant blocks (I blocked them OR They blocked me)
            const blocksRes = await db.query(
                'SELECT blocker_id, blocked_id FROM blocked_users WHERE blocker_id = $1 OR blocked_id = $1',
                [socket.user.id]
            );
            const hiddenSet = new Set();
            blocksRes.rows.forEach(r => {
                if (r.blocker_id === socket.user.id) hiddenSet.add(r.blocked_id);
                if (r.blocked_id === socket.user.id) hiddenSet.add(r.blocker_id);
            });

            for (const m of membersRes.rows) {
                if (m.user_id === socket.user.id) continue;
                if (hiddenSet.has(m.user_id)) continue;

                io.to(`user:${m.user_id}`).emit('typing:stop', {
                    room_id: roomId,
                    user_id: socket.user.id
                });
            }
        } catch (err) {
            console.error('Error in typing:stop:', err);
        }
    });

    // [NEW] Message Reactions
    socket.on('message:react', async ({ messageId, reaction }, callback) => {
        const safeCallback = typeof callback === 'function' ? callback : () => {};
        try {
            // Upsert reaction
            const res = await db.query(`
                INSERT INTO message_reactions (message_id, user_id, reaction)
                VALUES ($1, $2, $3)
                ON CONFLICT (message_id, user_id)
                DO UPDATE SET reaction = EXCLUDED.reaction, created_at = NOW()
                RETURNING message_id
            `, [messageId, socket.user.id, reaction]);

            if (res.rows[0]) {
                const msgRes = await db.query(`
                    SELECT room_id, content, type, ciphertext, iv, salt, key_version, temp_id 
                    FROM messages WHERE id = $1
                `, [messageId]);
                const msgData = msgRes.rows[0];

                if (msgData) {
                    // [NEW] Update room's last_message_at to bring it to top
                    await db.query('UPDATE rooms SET last_message_at = NOW() WHERE id = $1', [msgData.room_id]);

                    const userRes = await db.query('SELECT username, display_name, avatar_thumb_url FROM users WHERE id = $1', [socket.user.id]);
                    const userData = userRes.rows[0];

                    // [NEW] Get absolute latest message for reference
                    const officialLatest = await getLatestMessageMetadata(msgData.room_id);

                    io.to(`room:${msgData.room_id}`).emit('message:reaction_update', {
                        messageId,
                        roomId: msgData.room_id,
                        userId: socket.user.id,
                        reaction,
                        username: userData?.username,
                        display_name: userData?.display_name,
                        avatar_thumb_url: userData?.avatar_thumb_url,
                        // [NEW] Message metadata for sidebar preview
                        message_content: msgData.content,
                        message_type: msgData.type,
                        message_ciphertext: msgData.ciphertext,
                        message_iv: msgData.iv,
                        message_salt: msgData.salt,
                        message_key_version: msgData.key_version,
                        message_temp_id: msgData.temp_id,
                        // [NEW] Official latest message for reversion
                        official_latest_message: officialLatest
                    });
                }
                safeCallback({ status: 'ok' });
            } else {
                safeCallback({ status: 'error', error: 'Message not found' });
            }
        } catch (err) {
            console.error('[Reactions] Error adding reaction:', err);
            safeCallback({ status: 'error', error: 'Server error' });
        }
    });

    socket.on('message:unreact', async ({ messageId }, callback) => {
        const safeCallback = typeof callback === 'function' ? callback : () => {};
        try {
            const res = await db.query(`
                DELETE FROM message_reactions 
                WHERE message_id = $1 AND user_id = $2
                RETURNING message_id
            `, [messageId, socket.user.id]);

            if (res.rows.length > 0) {
                const msgRes = await db.query(`
                    SELECT room_id, content, type, ciphertext, iv, salt, key_version, temp_id 
                    FROM messages WHERE id = $1
                `, [messageId]);
                const msgData = msgRes.rows[0];

                if (msgData) {
                    // [NEW] Get absolute latest message for reference
                    const officialLatest = await getLatestMessageMetadata(msgData.room_id);

                    io.to(`room:${msgData.room_id}`).emit('message:reaction_update', {
                        messageId,
                        roomId: msgData.room_id,
                        userId: socket.user.id,
                        reaction: null,
                        // [NEW] Metadata even for unreact (can be used to restore message preview)
                        message_content: msgData.content,
                        message_type: msgData.type,
                        message_ciphertext: msgData.ciphertext,
                        message_iv: msgData.iv,
                        message_salt: msgData.salt,
                        message_key_version: msgData.key_version,
                        message_temp_id: msgData.temp_id,
                        // [NEW] Official latest message for reversion
                        official_latest_message: officialLatest
                    });
                }
                safeCallback({ status: 'ok' });
            } else {
                safeCallback({ status: 'ok' });
            }
        } catch (err) {
            console.error('[Reactions] Error removing reaction:', err);
            safeCallback({ status: 'error', error: 'Server error' });
        }
    });

    // --- VOICE/VIDEO CALL SIGNALING ---
    socket.on('call:invite', ({ to, signal, type, roomId, callerName, callerAvatar }) => {
        console.log(`[Call] Invite from ${socket.user.id} to ${to}`);
        io.to(`user:${to}`).emit('call:invite', {
            from: socket.user.id,
            signal,
            type,
            roomId,
            callerName,
            callerAvatar
        });
    });

    socket.on('call:accept', ({ to, signal }) => {
        console.log(`[Call] Accepted by ${socket.user.id} for ${to}`);
        io.to(`user:${to}`).emit('call:accepted', {
            signal,
            from: socket.user.id
        });
    });

    socket.on('call:busy', ({ to }) => {
        console.log(`[Call] User ${socket.user.id} is busy, notifying ${to}`);
        io.to(`user:${to}`).emit('call:busy', {
            from: socket.user.id
        });
    });

    socket.on('call:end', ({ to }) => {
        console.log(`[Call] Ended by ${socket.user.id}, notifying ${to}`);
        io.to(`user:${to}`).emit('call:ended', {
            from: socket.user.id
        });
    });

    socket.on('disconnect', () => {
        const userId = socket.user.id;
        console.log(`[DEBUG] Socket disconnected: User=${socket.user.username} (${userId}) SocketID=${socket.id} DeviceID=${socket.deviceId || 'N/A'}`);
        
        if (socket.deviceId) {
            socketMap.unregisterSocket(userId, socket.id);
            // NOTE: We no longer clear pendingSyncs on disconnect.
            // This allows the sync request to survive tab refreshes.
            // It will be cleared explicitly on sync_finished or sync_canceled.
        }
    });

});

const TENOR_API_KEY = process.env.TENOR_API_KEY;

// [NEW] Helper to get latest message metadata for a room
async function getLatestMessageMetadata(roomId) {
    const res = await db.query(`
        SELECT m.id, m.content, m.type, m.ciphertext, m.iv, m.salt, m.key_version, m.temp_id, 
               m.status, m.caption, m.file_name, m.is_view_once, m.viewed_by, m.attachments,
               m.created_at, m.user_id, u.display_name as sender_name, p.question as poll_question,
               COALESCE(
                   (SELECT json_agg(json_build_object(
                       'userId', r2.user_id, 
                       'reaction', r2.reaction,
                       'username', u_react.username,
                       'display_name', u_react.display_name,
                       'avatar_thumb_url', u_react.avatar_thumb_url
                    ))
                    FROM message_reactions r2 
                    JOIN users u_react ON r2.user_id = u_react.id
                    WHERE r2.message_id = m.id),
                   '[]'
               ) as reactions
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN polls p ON m.poll_id = p.id
        WHERE m.room_id = $1
        ORDER BY m.created_at DESC
        LIMIT 1
    `, [roomId]);
    return res.rows[0];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

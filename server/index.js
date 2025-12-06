require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');

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

// Basic route
app.get('/', (req, res) => {
    res.send('Chat Server Running');
});

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Socket Auth Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        next(new Error('Authentication error'));
    }
});

app.set('io', io);

io.on('connection', async (socket) => {
    console.log('User connected:', socket.user.username);
    
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

    socket.on('send_message', async ({ roomId, content }) => {
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
                    'INSERT INTO messages (room_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
                    [roomId, socket.user.id, content]
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
                    created_at: new Date().toISOString(),
                    username: socket.user.username,
                    display_name: user ? user.display_name : socket.user.display_name
                };

                console.log(`Emitting new_message to room:${roomId}`, message);
                io.to(`room:${roomId}`).emit('new_message', message);
            } else {
                console.log(`User ${socket.user.username} tried to send message to room ${roomId} but is not a member`);
            }
        } catch (err) {
            console.error('Error sending message:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.user.username);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

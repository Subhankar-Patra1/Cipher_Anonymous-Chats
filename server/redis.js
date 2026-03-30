const { createClient } = require('redis');

const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 3) {
                console.warn('[Redis] Max retries reached. Running without Redis (presence features disabled).');
                return false; // Stop retrying
            }
            return Math.min(retries * 500, 3000);
        }
    }
});

client.on('error', (err) => {
    if (!isConnected && err.code === 'ECONNREFUSED') {
        // Only log once on initial failure, not on every retry
        if (!client._loggedRefused) {
            console.warn('[Redis] Connection refused — running without Redis. Presence features will be unavailable.');
            client._loggedRefused = true;
        }
    } else if (isConnected) {
        console.error('Redis Client Error', err);
    }
});

let isConnected = false;

const connectRedis = async () => {
    if (!isConnected) {
        try {
            await client.connect();
            isConnected = true;
            console.log('Redis connected');
        } catch (err) {
            console.warn('[Redis] Could not connect:', err.message, '— continuing without Redis.');
            isConnected = false;
        }
    }
};

// Helper functions
const addSession = async (userId, sessionId) => {
    try {
        await client.sAdd(`user:${userId}:sessions`, sessionId);
        // Set session details with TTL
        await client.hSet(`session:${sessionId}`, {
            userId: userId.toString(),
            connectedAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString()
        });
        await client.expire(`session:${sessionId}`, 90); // 90s TTL
        
        // Return session count
        return await client.sCard(`user:${userId}:sessions`);
    } catch (err) {
        console.error('Redis addSession error:', err);
        return 0;
    }
};

const removeSession = async (userId, sessionId) => {
    try {
        await client.sRem(`user:${userId}:sessions`, sessionId);
        await client.del(`session:${sessionId}`);
        return await client.sCard(`user:${userId}:sessions`);
    } catch (err) {
        console.error('Redis removeSession error:', err);
        return 0;
    }
};

const heartbeatSession = async (sessionId) => {
    try {
        // Refresh TTL
        const exists = await client.expire(`session:${sessionId}`, 90);
        if (exists) {
            await client.hSet(`session:${sessionId}`, 'lastHeartbeat', new Date().toISOString());
        }
        return exists;
    } catch (err) {
        console.error('Redis heartbeatSession error:', err);
        return false;
    }
};

const setLastSeen = async (userId) => {
    try {
        const now = new Date().toISOString();
        // Set in Redis for fast access
        await client.set(`user:${userId}:last_seen`, now);
        return now;
    } catch (err) {
        console.error('Redis setLastSeen error:', err);
        return null;
    }
};

const getOnlineStatus = async (userIds) => {
    try {
        // userIds is an array of IDs
        const multi = client.multi();
        userIds.forEach(id => {
            multi.sCard(`user:${id}:sessions`); // Check if online (session count > 0)
            multi.get(`user:${id}:last_seen`);  // Get last seen
        });
        
        const results = await multi.exec();
        // Results are interleaved: [count1, lastSeen1, count2, lastSeen2, ...]
        
        const statuses = {};
        for (let i = 0; i < userIds.length; i++) {
            const count = results[i * 2];
            const lastSeen = results[i * 2 + 1];
            statuses[userIds[i]] = {
                online: count > 0,
                sessionCount: count,
                last_seen: lastSeen
            };
        }
        return statuses;
    } catch (err) {
        console.error('Redis getOnlineStatus error:', err);
        return {};
    }
};

const getSingleUserStatus = async (userId) => {
    try {
        const count = await client.sCard(`user:${userId}:sessions`);
        const lastSeen = await client.get(`user:${userId}:last_seen`);
        return {
            online: count > 0,
            sessionCount: count,
            last_seen: lastSeen
        };
    } catch (err) {
        console.error('Redis getSingleUserStatus error:', err);
        return { online: false, sessionCount: 0, last_seen: null };
    }
};


module.exports = {
    connectRedis,
    client,
    addSession,
    removeSession,
    heartbeatSession,
    setLastSeen,
    getOnlineStatus,
    getSingleUserStatus
};

const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

// Middleware to verify token
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

/**
 * In-Memory Key Store for Signal Protocol Public Keys
 * Structure:
 * {
 *   [userId]: {
 *     [deviceId]: {
 *       registrationId,
 *       identityKey, // string
 *       preKey: { keyId, publicKey },
 *       signedPreKey: { keyId, publicKey, signature }
 *     }
 *   }
 * }
 * Note: In a production app with thousands of users, this should be stored in your PostgreSQL/Redis database.
 */
const globalKeyStore = {};

// 1. Upload Keys (From a user's React App when they log in)
router.post('/upload', authenticate, (req, res) => {
    const userId = String(req.user.id);
    const { deviceId, bundle } = req.body;

    if (!deviceId || !bundle) {
        return res.status(400).json({ error: 'deviceId and key bundle are required' });
    }

    if (!globalKeyStore[userId]) {
        globalKeyStore[userId] = {};
    }

    globalKeyStore[userId][deviceId] = bundle;
    console.log(`[Signal] Saved Public Keys for User ${userId}, Device ${deviceId}`);

    res.json({ success: true });
});

// 2. Download Keys (When User A wants to start a chat with User B)
router.get('/:userId/devices/:deviceId', authenticate, (req, res) => {
    const targetUserId = String(req.params.userId);
    const targetDeviceId = String(req.params.deviceId);

    const userDevices = globalKeyStore[targetUserId];
    if (!userDevices || !userDevices[targetDeviceId]) {
        return res.status(404).json({ error: 'Keys not found for this user/device' });
    }

    const bundle = userDevices[targetDeviceId];
    res.json(bundle);
});

// 3. Get all active devices for a user so we can send messages to all their logged-in phones/laptops
router.get('/:userId/devices', authenticate, (req, res) => {
    const targetUserId = String(req.params.userId);
    const userDevices = globalKeyStore[targetUserId];

    if (!userDevices) {
        return res.json([]);
    }

    // Return an array of device IDs
    res.json(Object.keys(userDevices));
});

module.exports = router;

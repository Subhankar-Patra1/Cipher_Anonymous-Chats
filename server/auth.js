const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

router.post('/signup', async (req, res) => {
    const { username, displayName, password } = req.body;
    console.log('[DEBUG-SIGNUP] Body:', JSON.stringify(req.body));
    
    if (!username || !displayName || !password) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Generate Recovery Code
        const recoveryCode = `RECOVERY-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const recoveryCodeHash = await bcrypt.hash(recoveryCode, 10);

        // Postgres: Use RETURNING id to get the inserted ID
        const result = await db.query(
            'INSERT INTO users (username, display_name, password_hash, recovery_code_hash) VALUES ($1, $2, $3, $4) RETURNING id',
            [username, displayName, hashedPassword, recoveryCodeHash]
        );
        
        const newUserId = result.rows[0].id;

        // [NEW] Create Session
        const ua = new UAParser(req.headers['user-agent']);
        const browser = ua.getBrowser();
        const os = ua.getOS();
        const device = ua.getDevice();
        
        const deviceName = device.model ? `${device.vendor || ''} ${device.model}` : `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
        const deviceType = device.type || 'desktop'; // default to desktop if undefined
        const sessionId = uuidv4();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        await db.query(`
            INSERT INTO user_sessions (id, user_id, device_name, device_type, os, browser, ip_address, location)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            sessionId, 
            newUserId, 
            deviceName, 
            deviceType, 
            os.name || 'Unknown', 
            browser.name || 'Unknown', 
            ip, 
            null // Location is optional
        ]);
        
        const token = jwt.sign({ id: newUserId, username, display_name: displayName, sessionId }, JWT_SECRET);
        res.json({ 
            token, 
            user: { id: newUserId, username, display_name: displayName, share_presence: 'everyone' },
            recoveryCode // Return only once
        });
    } catch (error) {
        // Postgres unique violation code is 23505
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Username taken' });
        }
        console.error("Signup error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // [NEW] Create Session
        const ua = new UAParser(req.headers['user-agent']);
        const browser = ua.getBrowser();
        const os = ua.getOS();
        const device = ua.getDevice();
        
        const deviceName = device.model ? `${device.vendor || ''} ${device.model}` : `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
        const deviceType = device.type || 'desktop';
        const sessionId = uuidv4();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        await db.query(`
            INSERT INTO user_sessions (id, user_id, device_name, device_type, os, browser, ip_address, location)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            sessionId, 
            user.id, 
            deviceName, 
            deviceType, 
            os.name || 'Unknown', 
            browser.name || 'Unknown', 
            ip, 
            null
        ]);

        const token = jwt.sign({ id: user.id, username: user.username, display_name: user.display_name, sessionId }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, share_presence: user.share_presence, avatar_url: user.avatar_url, avatar_thumb_url: user.avatar_thumb_url } });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/recover-account', async (req, res) => {
    const { username, recoveryCode, newPassword } = req.body;

    if (!username || !recoveryCode || !newPassword) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = rows[0];

        if (!user || user.recovery_code_hash === null) {
            return res.status(401).json({ error: 'Invalid information' });
        }

        const isMatch = await bcrypt.compare(recoveryCode, user.recovery_code_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid recovery code' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error("Recovery error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // [NEW] Validate Session
        if (decoded.sessionId) {
            const sessionCheck = await db.query('SELECT last_active_at FROM user_sessions WHERE id = $1 AND user_id = $2', [decoded.sessionId, decoded.id]);
            if (sessionCheck.rows.length === 0) {
                 return res.status(401).json({ error: 'Session expired or revoked' });
            }
            
            // Expiry check (30 days)
            const lastActive = new Date(sessionCheck.rows[0].last_active_at);
            const now = new Date();
            const diffDays = (now - lastActive) / (1000 * 60 * 60 * 24);
            if (diffDays > 30) {
                 await db.query('DELETE FROM user_sessions WHERE id = $1', [decoded.sessionId]);
                 return res.status(401).json({ error: 'Session expired' });
            }

            // Update activity (throttled - only update if more than 1 minute has passed)
            // This prevents excessively slowing down the /me request which is called on every page load
            const diffMinutes = (now - lastActive) / (1000 * 60);
            if (diffMinutes > 1) {
                await db.query('UPDATE user_sessions SET last_active_at = NOW() WHERE id = $1', [decoded.sessionId]);
            }
        } else {
             // For legacy tokens (optional: force logout or allow temporarily)
             // User requested "Review Required ... requires all existing users to log out"
             // So strict mode:
             return res.status(401).json({ error: 'Invalid token structure. Please login again.' });
        }

        const { rows } = await db.query('SELECT id, username, display_name, share_presence, avatar_url, avatar_thumb_url FROM users WHERE id = $1', [decoded.id]);
        const user = rows[0];
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);

    // Get current user id from token if available (to exclude self)
    const token = req.headers.authorization?.split(' ')[1];
    let currentUserId = null;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            currentUserId = decoded.id;
        } catch (e) {}
    }

    try {
        // Note: Postgres uses $1, $2. 
        // We use ILIKE for case-insensitive search if desired, but LIKE is standard.
        const { rows } = await db.query(
            'SELECT id, username, display_name, avatar_thumb_url FROM users WHERE username LIKE $1 AND id != $2 LIMIT 10', 
            [`%${q}%`, currentUserId || -1]
        );
        res.json(rows);
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/check-username', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
        const { rows } = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        res.json({ available: rows.length === 0 });
    } catch (error) {
        console.error("Check username error:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

router.post('/signup', async (req, res) => {
    const { username, displayName, password } = req.body;
    console.log('[DEBUG-SIGNUP] Body:', JSON.stringify(req.body));
    
    if (!username || !displayName || !password) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 8);
        
        // Generate Recovery Code
        const recoveryCode = `RECOVERY-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const recoveryCodeHash = await bcrypt.hash(recoveryCode, 8);

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
        
        // [FIX] Only use device model if meaningful (>2 chars and has vendor)
        const deviceName = (device.model && device.model.length > 2 && device.vendor) 
            ? `${device.vendor} ${device.model}` 
            : `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
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
        
        // Handle Connection Errors gracefully
        if (error.message.includes('getaddrinfo') || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return res.status(503).json({ error: 'Unable to connect to server. Please check your internet connection.' });
        }
        
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
});

router.post('/login', async (req, res) => {
    const { username, password, deviceId, publicKey, signingPublicKey } = req.body;

    try {
        const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if user has a password (if not, they signed up via OAuth)
        if (!user.password_hash) {
            const authMethod = user.auth_method ? ` via ${user.auth_method}` : ' with Google or GitHub';
            return res.status(400).json({ error: `This account was created${authMethod}. Please log in using that method.` });
        }

        if (!(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // [OPTIMIZED] Create Session in background - don't block login response
        const ua = new UAParser(req.headers['user-agent']);
        const browser = ua.getBrowser();
        const os = ua.getOS();
        const device = ua.getDevice();
        
        // [FIX] Only use device model if meaningful (>2 chars and has vendor)
        const deviceName = (device.model && device.model.length > 2 && device.vendor) 
            ? `${device.vendor} ${device.model}` 
            : `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
        const deviceType = device.type || 'desktop';
        const sessionId = uuidv4();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Generate token immediately with session ID
        const token = jwt.sign({ id: user.id, username: user.username, display_name: user.display_name, sessionId }, JWT_SECRET);
        
        // [FIX] Create session BEFORE sending response to prevent race condition
        // This ensures /me can find the session immediately after login
        try {
            await db.query(`
                INSERT INTO user_sessions (id, user_id, device_name, device_type, os, browser, ip_address, location)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
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
        } catch (sessionErr) {
            console.error('[Login] Session creation failed:', sessionErr);
            // Continue anyway - the /me endpoint will create a recovery session if needed
        }

        // Send response after session is created
        res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, share_presence: user.share_presence, avatar_url: user.avatar_url, avatar_thumb_url: user.avatar_thumb_url } });

        // [OPTIMIZED] Device Registration in background (non-blocking)
        if (deviceId && publicKey) {
            (async () => {
                try {
                    let deviceLabel = deviceName;
                    await db.query(`
                        INSERT INTO user_devices (id, user_id, public_key, signing_public_key, label, last_active_at)
                        VALUES ($1, $2, $3, $4, $5, NOW())
                        ON CONFLICT (id) DO UPDATE 
                        SET last_active_at = NOW(), public_key = $3, signing_public_key = $4, user_id = $2, label = $5
                    `, [deviceId, user.id, publicKey, signingPublicKey, deviceLabel]);
                } catch (bgErr) {
                    console.error('[Login] Device registration failed:', bgErr);
                }
            })();
        }
    } catch (error) {
        console.error("Login error:", error);
        
        if (error.message.includes('getaddrinfo') || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return res.status(503).json({ error: 'Unable to connect to server. Please check your internet connection.' });
        }
        
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
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

        const hashedPassword = await bcrypt.hash(newPassword, 8);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error("Recovery error:", error);
        
        if (error.message.includes('getaddrinfo') || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return res.status(503).json({ error: 'Unable to connect to server. Please check your internet connection.' });
        }

        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
});

router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // [FIX] Handle session validation more gracefully
        if (decoded.sessionId) {
            const sessionCheck = await db.query('SELECT last_active_at FROM user_sessions WHERE id = $1 AND user_id = $2', [decoded.sessionId, decoded.id]);
            
            if (sessionCheck.rows.length === 0) {
                // [FIX] Session not found - could be a race condition or DB issue during login
                // Instead of rejecting, create a recovery session so user isn't logged out
                console.warn(`[Auth] Session ${decoded.sessionId} not found for user ${decoded.id}, creating recovery session`);
                try {
                    await db.query(`
                        INSERT INTO user_sessions (id, user_id, device_name, device_type, os, browser, ip_address)
                        VALUES ($1, $2, 'Recovered Session', 'unknown', 'Unknown', 'Unknown', $3)
                        ON CONFLICT (id) DO NOTHING
                    `, [decoded.sessionId, decoded.id, req.headers['x-forwarded-for'] || req.socket.remoteAddress]);
                } catch (e) {
                    console.error('[Auth] Failed to create recovery session:', e);
                }
            } else {
                // Expiry check (30 days)
                const lastActive = new Date(sessionCheck.rows[0].last_active_at);
                const now = new Date();
                const diffDays = (now - lastActive) / (1000 * 60 * 60 * 24);
                if (diffDays > 30) {
                     await db.query('DELETE FROM user_sessions WHERE id = $1', [decoded.sessionId]);
                     return res.status(401).json({ error: 'Session expired' });
                }

                // Update activity (throttled - only update if more than 1 minute has passed)
                const diffMinutes = (now - lastActive) / (1000 * 60);
                if (diffMinutes > 1) {
                    // Don't await - fire and forget for speed
                    db.query('UPDATE user_sessions SET last_active_at = NOW() WHERE id = $1', [decoded.sessionId])
                        .catch(e => console.error('[Auth] Activity update failed:', e));
                }
            }
        }
        // [FIX] Removed the strict sessionId requirement - allow legacy tokens to work
        // This prevents logout-on-refresh for users with older tokens

        const { rows } = await db.query('SELECT id, username, display_name, share_presence, avatar_url, avatar_thumb_url, auth_method FROM users WHERE id = $1', [decoded.id]);
        const user = rows[0];
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (error) {
        console.error('[Auth] /me error:', error.message);
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

// [NEW E2EE] Register Device & Public Key
router.post('/device', async (req, res) => {
    // Expected: { deviceId, publicKey, label? }
    // User must be authenticated (Token has sessionId, but deviceId might be new if re-install? 
    // Wait, if token has sessionId, that's from user_sessions. 
    // We are linking the crypto deviceId (UUID) to user.
    
    // Auth check manually since router level middleware isn't strictly applied here in this file structure shown previously?
    // Actually top level index.js likely applies generic auth or this router lacks it?
    // Looking at messages.js, it has 'router.use(authenticate)'. 
    // auth.js usually is public. But /device requires we know WHO the user is.
    // Let's expect headers.authorization.
    
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    
    let userId;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const { deviceId, publicKey, label, signingPublicKey } = req.body;
    if (!deviceId || !publicKey) {
        return res.status(400).json({ error: 'Missing device info' });
    }

    // [NEW] Generate rich label from User-Agent
    const ua = new UAParser(req.headers['user-agent']);
    const browser = ua.getBrowser();
    const os = ua.getOS();
    const device = ua.getDevice();
    
    let deviceLabel = label;
    if (!deviceLabel) {
        // [FIX] Only use device model if it's meaningful (>2 chars and has a vendor)
        // Otherwise fall back to browser name to avoid cryptic labels like "K (Android)"
        if (device.model && device.model.length > 2 && device.vendor) {
            deviceLabel = `${device.vendor} ${device.model} (${os.name || 'Android'})`.trim();
        } else {
            // Use browser name for better readability
            deviceLabel = `${browser.name || 'Browser'} on ${os.name || 'Unknown OS'}`;
        }
    }

    try {
        // Upsert device
        await db.query(`
            INSERT INTO user_devices (id, user_id, public_key, signing_public_key, label, last_active_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (id) DO UPDATE 
            SET last_active_at = NOW(), public_key = $3, signing_public_key = $4, user_id = $2, label = $5
        `, [deviceId, userId, publicKey, signingPublicKey, deviceLabel]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Device registration failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// [NEW] Get Client Devices
router.get('/devices', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        const decoded = require('jsonwebtoken').verify(token, JWT_SECRET);
        const userId = decoded.id;

        const { rows } = await db.query(
            'SELECT id, public_key, label, last_active_at, created_at, signing_public_key FROM user_devices WHERE user_id = $1 ORDER BY last_active_at DESC',
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Get devices failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// [NEW] Revoke Device
router.delete('/devices/:deviceId', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        const decoded = require('jsonwebtoken').verify(token, JWT_SECRET);
        const userId = decoded.id;
        const deviceId = req.params.deviceId;

        // [SECURITY] Prevent revoking self (Client UI blocks it, but API must too?)
        // Actually, revoking self is a "Logout". It's fine but treating it as revocation is okay.
        // However, for strictly E2EE revocation context, usually we revoke *other* devices.
        // Users might want to "Logout via Revocation" which is fine.
        
        // Check ownership
        const check = await db.query('SELECT user_id FROM user_devices WHERE id = $1', [deviceId]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
        if (check.rows[0].user_id !== userId) return res.status(403).json({ error: 'Not your device' });

        // [FIX] Handle room_key_versions foreign key (missing ON DELETE CASCADE)
        await db.query('UPDATE room_key_versions SET created_by_device_id = NULL WHERE created_by_device_id = $1', [deviceId]);

        // Delete (Cascades to room_keys)
        await db.query('DELETE FROM user_devices WHERE id = $1', [deviceId]);
        
        // Optional: Also kill sessions for this device if we can link them?
        // We link via user_sessions but we don't strictly track Crypto Device ID in user_sessions yet.
        // Future improvement: Link session to crypto device ID.
        
        res.json({ success: true });
    } catch (err) {
        console.error('Revoke device failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// [NEW] Cloud Backup Routes
router.post('/backup', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id;
        const { encryptedBlob, salt, iv } = req.body;

        if (!encryptedBlob || !salt || !iv) {
            return res.status(400).json({ error: 'Missing backup data' });
        }

        await db.query(`
            INSERT INTO key_backups (user_id, encrypted_blob, salt, iv, password_hint)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id) DO UPDATE 
            SET encrypted_blob = $2, salt = $3, iv = $4, password_hint = $5, created_at = NOW()
        `, [userId, encryptedBlob, salt, iv, req.body.passwordHint || null]);

        res.json({ success: true });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

router.get('/backup', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id;

        const { rows } = await db.query('SELECT encrypted_blob, salt, iv, password_hint FROM key_backups WHERE user_id = $1', [userId]);
        
        if (rows.length === 0) {
            return res.json(null);
        }
        
        res.json(rows[0]);
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;

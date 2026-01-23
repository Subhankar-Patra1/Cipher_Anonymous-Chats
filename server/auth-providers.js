const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const jwt = require('jsonwebtoken');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const UAParser = require('ua-parser-js');
const crypto = require('crypto'); // [NEW]
const bcrypt = require('bcryptjs'); // [NEW]

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Passport serialize/deserialize (for session management)
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
        if (!rows[0]) {
            // User deleted but session exists - invalidate session user
            return done(null, null); 
        }
        done(null, rows[0]);
    } catch (err) {
        done(err, null);
    }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // CRITICAL: Must be the full URL "http://localhost:5000/api/auth/google/callback"
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if OAuth account exists
        const { rows: oauthAccounts } = await db.query(
            'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
            ['google', profile.id]
        );

        if (oauthAccounts.length > 0) {
            // Existing OAuth account - get user
            const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [oauthAccounts[0].user_id]);
            const user = users[0];

            // [MODIFIED] If avatar is from Google, CLEAR IT to use fallback initials
            // We check if it contains googleusercontent.com
            if (user.avatar_url && user.avatar_url.includes('googleusercontent.com')) {
                await db.query('UPDATE users SET avatar_url = NULL, avatar_thumb_url = NULL WHERE id = $1', [user.id]);
                user.avatar_url = null;
                user.avatar_thumb_url = null;
            }
            
            // Update access token
            await db.query(
                'UPDATE oauth_accounts SET access_token = $1, refresh_token = $2, updated_at = NOW() WHERE id = $3',
                [accessToken, refreshToken, oauthAccounts[0].id]
            );
            
            return done(null, user);
        }

        // Check if user exists with this email (for account linking)
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        let user;

        if (email) {
            const { rows: existingUsers } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            if (existingUsers.length > 0) {
                user = existingUsers[0];
            }
        }

        // Create new user if doesn't exist
        if (!user) {
            const displayName = profile.displayName || profile.username || `User${Math.floor(Math.random() * 10000)}`;
            const username = `@${profile.id.substring(0, 15)}`; // Generate username from Google ID
            const avatarUrl = null; // [MODIFIED] Do not use Google photo by default

            // [NEW] Generate Recovery Code
            const recoveryCode = `RECOVERY-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            const recoveryCodeHash = await bcrypt.hash(recoveryCode, 10);

            const { rows: newUsers } = await db.query(
                'INSERT INTO users (username, display_name, email, auth_method, avatar_url, recovery_code_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [username, displayName, email, 'oauth', avatarUrl, recoveryCodeHash]
            );
            user = newUsers[0];
            user.isNewUser = true; 
            user.generatedRecoveryCode = recoveryCode; // Pass to callback
        } else {
            // Update existing user to mark as using OAuth
            await db.query(
                'UPDATE users SET auth_method = $1, email = $2 WHERE id = $3',
                ['multiple', email, user.id]
            );
        }

        // Create OAuth account record
        await db.query(
            `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, display_name, avatar_url, access_token, refresh_token)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [user.id, 'google', profile.id, email, profile.displayName, profile.photos?.[0]?.value, accessToken, refreshToken]
        );

        return done(null, user);
    } catch (err) {
        console.error('Google OAuth error:', err);
        return done(err, null);
    }
}));

// GitHub OAuth Strategy
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if OAuth account exists
        const { rows: oauthAccounts } = await db.query(
            'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
            ['github', profile.id]
        );

        if (oauthAccounts.length > 0) {
            // Existing OAuth account - get user
            const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [oauthAccounts[0].user_id]);
            const user = users[0];

            // [MODIFIED] If avatar is from GitHub, CLEAR IT
            if (user.avatar_url && (user.avatar_url.includes('githubusercontent.com') || user.avatar_url.includes('avatars.github'))) {
                 await db.query('UPDATE users SET avatar_url = NULL, avatar_thumb_url = NULL WHERE id = $1', [user.id]);
                 user.avatar_url = null;
                 user.avatar_thumb_url = null;
            }
            
            // Update access token
            await db.query(
                'UPDATE oauth_accounts SET access_token = $1, updated_at = NOW() WHERE id = $2',
                [accessToken, oauthAccounts[0].id]
            );
            
            return done(null, user);
        }

        // Get primary email from GitHub
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        let user;

        if (email) {
            const { rows: existingUsers } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            if (existingUsers.length > 0) {
                user = existingUsers[0];
            }
        }

        // Create new user if doesn't exist
        if (!user) {
            const displayName = profile.displayName || profile.username || `User${Math.floor(Math.random() * 10000)}`;
            const username = `@${profile.username || profile.id.substring(0, 15)}`;
            const avatarUrl = null; // [MODIFIED] Do not use GitHub photo by default

            // [NEW] Generate Recovery Code
            const recoveryCode = `RECOVERY-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            const recoveryCodeHash = await bcrypt.hash(recoveryCode, 10);

            const { rows: newUsers } = await db.query(
                'INSERT INTO users (username, display_name, email, auth_method, avatar_url, recovery_code_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [username, displayName, email, 'oauth', avatarUrl, recoveryCodeHash]
            );
            user = newUsers[0];
            user.isNewUser = true;
            user.generatedRecoveryCode = recoveryCode; // Pass to callback
        } else {
            // Update existing user to mark as using OAuth
            await db.query(
                'UPDATE users SET auth_method = $1, email = $2 WHERE id = $3',
                ['multiple', email, user.id]
            );
        }

        // Create OAuth account record
        await db.query(
            `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, display_name, avatar_url, access_token)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.id, 'github', profile.id, email, profile.displayName || profile.username, profile.photos?.[0]?.value, accessToken]
        );

        return done(null, user);
    } catch (err) {
        console.error('GitHub OAuth error:', err);
        return done(err, null);
    }
}));

// OAuth Routes

// Google OAuth
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'] 
}));

router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/auth?error=google_auth_failed' }),
    async (req, res) => {
        try {
            // Create session
            const ua = new UAParser(req.headers['user-agent']);
            const browser = ua.getBrowser();
            const os = ua.getOS();
            const device = ua.getDevice();
            
            const deviceName = device.model ? `${device.vendor || ''} ${device.model}` : `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
            const deviceType = device.type || 'desktop';
            const sessionId = uuidv4();
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            await db.query(`
                INSERT INTO user_sessions (id, user_id, device_name, device_type, os, browser, ip_address)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [sessionId, req.user.id, deviceName, deviceType, os.name || 'Unknown', browser.name || 'Unknown', ip]);
            
            // Generate JWT
            const token = jwt.sign({ 
                id: req.user.id, 
                username: req.user.username, 
                display_name: req.user.display_name, 
                isNewUser: req.user.isNewUser, // [NEW] Pass onboarding flag
                sessionId 
            }, JWT_SECRET);

            // Redirect to frontend with token
            const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
            let redirectUrl = `${clientUrl}/auth/callback?token=${token}&provider=google`;
            if (req.user.generatedRecoveryCode) {
                 redirectUrl += `&recoveryCode=${req.user.generatedRecoveryCode}`;
            }
            res.redirect(redirectUrl);
        } catch (err) {
            console.error('OAuth callback error:', err);
            res.redirect('/auth?error=session_creation_failed');
        }
    }
);

// GitHub OAuth
router.get('/github', passport.authenticate('github', { 
    scope: ['user:email'] 
}));

router.get('/github/callback', 
    passport.authenticate('github', { failureRedirect: '/auth?error=github_auth_failed' }),
    async (req, res) => {
        try {
            // Create session
            const ua = new UAParser(req.headers['user-agent']);
            const browser = ua.getBrowser();
            const os = ua.getOS();
            const device = ua.getDevice();
            
            const deviceName = device.model ? `${device.vendor || ''} ${device.model}` : `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
            const deviceType = device.type || 'desktop';
            const sessionId = uuidv4();
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            await db.query(`
                INSERT INTO user_sessions (id, user_id, device_name, device_type, os, browser, ip_address)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [sessionId, req.user.id, deviceName, deviceType, os.name || 'Unknown', browser.name || 'Unknown', ip]);
            
            // Generate JWT
            const token = jwt.sign({ 
                id: req.user.id, 
                username: req.user.username, 
                display_name: req.user.display_name, 
                sessionId 
            }, JWT_SECRET);

            // Redirect to frontend with token
            const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
            let redirectUrl = `${clientUrl}/auth/callback?token=${token}&provider=github`;
            if (req.user.generatedRecoveryCode) {
                 redirectUrl += `&recoveryCode=${req.user.generatedRecoveryCode}`;
            }
            res.redirect(redirectUrl);
        } catch (err) {
            console.error('OAuth callback error:', err);
            res.redirect('/auth?error=session_creation_failed');
        }
    }
);

// Get user's linked OAuth accounts
router.get('/linked-accounts', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { rows } = await db.query(
            'SELECT provider, email, display_name, created_at FROM oauth_accounts WHERE user_id = $1',
            [decoded.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;

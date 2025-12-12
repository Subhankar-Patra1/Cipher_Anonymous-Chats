const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function run() {
    try {
        // Get a user
        const uRes = await pool.query('SELECT id FROM users LIMIT 1');
        if (uRes.rows.length === 0) {
            console.log('No users found');
            return;
        }
        const userId = uRes.rows[0].id;
        console.log('Testing with User ID:', userId);

        // 1. Try create room
        console.log('Inserting room...');
        const roomRes = await pool.query(`
            INSERT INTO rooms (name, type, created_by) 
            VALUES ($1, 'ai', $2) 
            RETURNING id
        `, ['AI Assistant', userId]);
        const roomId = roomRes.rows[0].id;
        console.log('Room created:', roomId);

        // 2. Add member
        console.log('Adding member...');
        await pool.query(`
            INSERT INTO room_members (room_id, user_id, role) 
            VALUES ($1, $2, 'owner')
        `, [roomId, userId]);
        console.log('Member added.');

        // 3. Create session
        console.log('Creating session...');
        await pool.query(`
            INSERT INTO ai_sessions (user_id, room_id) 
            VALUES ($1, $2)
        `, [userId, roomId]);
        console.log('Session created.');

    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        pool.end();
    }
}

run();

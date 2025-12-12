const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'rooms' AND column_name = 'id';
        `);
        console.log('rooms.id type:', res.rows[0]);
        
        const res2 = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'ai_sessions' AND column_name = 'room_id';
        `);
        console.log('ai_sessions.room_id type:', res2.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

check();

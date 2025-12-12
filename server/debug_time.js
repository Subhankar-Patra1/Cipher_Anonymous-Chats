require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkTime() {
    try {
        console.log('Connecting to DB...');
        const res = await pool.query('SELECT NOW() as now, created_at FROM messages LIMIT 1');
        const now = res.rows[0].now;
        
        console.log('DB NOW():', now);
        console.log('Type of NOW:', typeof now);
        if (typeof now === 'object') {
             console.log('Is Date?', now instanceof Date);
             console.log('toISOString:', now.toISOString());
             console.log('toString:', now.toString());
        }

        const msgRes = await pool.query(`
            INSERT INTO messages (room_id, user_id, content, meta) 
            VALUES ((SELECT id FROM rooms LIMIT 1), (SELECT id FROM users LIMIT 1), 'DEBUG MSG', '{}') 
            RETURNING created_at
        `);
        const createdAt = msgRes.rows[0].created_at;
        console.log('Inserted Message created_at:', createdAt);
        console.log('Type:', typeof createdAt);
        if (typeof createdAt === 'object') {
             console.log('toISOString:', createdAt.toISOString());
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkTime();

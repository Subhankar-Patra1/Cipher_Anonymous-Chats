const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        // Get recent messages from AI room (room 38)
        const msgs = await pool.query(`
            SELECT id, user_id, LEFT(content, 50) as content_preview, created_at
            FROM messages 
            WHERE room_id = 38
            ORDER BY id DESC
            LIMIT 15
        `);
        
        console.log('Recent messages in AI room (newest first):');
        msgs.rows.forEach(r => {
            console.log(`[${r.id}] user:${r.user_id} "${r.content_preview}..."`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        pool.end();
    }
}


check();


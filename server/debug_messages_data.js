const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function check() {
    try {
        const res = await pool.query(`
            SELECT id, temp_id, left(ciphertext, 20) as cipher_start, left(signature, 20) as sig_start, key_version, sender_device_id
            FROM messages 
            WHERE ciphertext IS NOT NULL 
            ORDER BY created_at DESC 
            LIMIT 5;
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

check();

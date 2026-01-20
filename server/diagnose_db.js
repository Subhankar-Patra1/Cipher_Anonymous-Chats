const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function check() {
    try {
        console.log('Checking for corrupted signed messages...');

        const nullTemp = await pool.query('SELECT count(*) FROM messages WHERE signature IS NOT NULL AND temp_id IS NULL');
        console.log('Signed messages with NULL temp_id:', nullTemp.rows[0].count);

        const nullKeyVer = await pool.query('SELECT count(*) FROM messages WHERE signature IS NOT NULL AND key_version IS NULL');
        console.log('Signed messages with NULL key_version:', nullKeyVer.rows[0].count);

        const nullDevId = await pool.query('SELECT count(*) FROM messages WHERE signature IS NOT NULL AND sender_device_id IS NULL');
        console.log('Signed messages with NULL sender_device_id:', nullDevId.rows[0].count);

        // Check for mismatch in ID usage?
        // Hard to check in SQL unless we stored "what ID was used".

        // List a few problem candidates
        const candidates = await pool.query(`
            SELECT id, temp_id, left(ciphertext, 10), signature IS NOT NULL as is_signed
            FROM messages 
            WHERE signature IS NOT NULL 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        console.table(candidates.rows);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

check();

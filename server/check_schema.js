const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function check() {
    try {
        const res = await pool.query(`
            SELECT count(*) 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'public_key';
        `);
        console.log('public_key count:', res.rows[0].count);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

check();

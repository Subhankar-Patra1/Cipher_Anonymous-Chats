const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function check() {
    try {
        const res = await pool.query(`SELECT id, name FROM rooms LIMIT 1`);
        console.log('Room sample:', res.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

check();

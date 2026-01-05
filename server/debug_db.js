const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function run() {
    try {
        const res = await pool.query(`
            SELECT table_name, column_name, data_type, udt_name
            FROM information_schema.columns 
            WHERE (table_name = 'messages' OR table_name = 'users') AND column_name = 'id';
        `);
        console.log('Columns:', JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        pool.end();
    }
}

run();

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function run() {
    try {
        console.log('Creating message_deliveries table...');
        
        // message_id is UUID (from previous checks)
        // user_id is INTEGER (from previous checks)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS message_deliveries (
                message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                delivered_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (message_id, user_id)
            );
        `);
        
        console.log('message_deliveries table created successfully.');

    } catch (e) {
        console.error('Error creating table:', e);
    } finally {
        pool.end();
    }
}

run();

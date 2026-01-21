const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        // Check id column type
        const idType = await pool.query(`
            SELECT data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'id'
        `);
        console.log('users.id column:', idType.rows[0]);
        
        // Check if AI user exists
        const res = await pool.query("SELECT id, username, display_name FROM users WHERE username = 'SparkleAI'");
        console.log('Existing AI User:', res.rows);
        
        if (res.rows.length === 0) {
            console.log('Creating AI user (omitting id to let it auto-generate)...');
            const newAi = await pool.query(`
                INSERT INTO users (username, display_name, password_hash)
                VALUES ('SparkleAI', 'Sparkle AI', 'system_account')
                RETURNING id, username, display_name
            `);
            console.log('Created AI user:', newAi.rows[0]);
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        pool.end();
    }
}

check();




// Quick script to create session table
require('dotenv').config();
const db = require('./db');

async function createSessionTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS session (
                sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
                sess JSON NOT NULL,
                expire TIMESTAMP(6) NOT NULL
            );
        `);
        
        await db.query(`
            CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);
        `);
        
        console.log('✅ Session table created successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creating session table:', err.message);
        process.exit(1);
    }
}

createSessionTable();

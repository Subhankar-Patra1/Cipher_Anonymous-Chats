const db = require('./db');

async function migrate() {
    try {
        console.log('Starting migration: adding cleared_at and is_hidden to room_members...');
        
        await db.query(`
            ALTER TABLE room_members 
            ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
        `);

        console.log('Migration successful: Columns added.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();

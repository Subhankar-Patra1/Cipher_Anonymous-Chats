const db = require('./db');

async function migrate() {
    try {
        console.log('Migrating: Adding is_archived to room_members...');
        await db.query(`
            ALTER TABLE room_members 
            ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
        `);
        console.log('Migration successful: is_archived column added.');
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();

const db = require('./db');

async function migrate() {
    try {
        console.log('Migrating: Adding is_pinned to room_members...');
        await db.query(`
            ALTER TABLE room_members 
            ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
        `);
        console.log('Migration successful: is_pinned column added.');
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();

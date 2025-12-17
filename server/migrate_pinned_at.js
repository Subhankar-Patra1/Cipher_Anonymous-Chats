const db = require('./db');

async function migrate() {
    try {
        console.log('Migrating: Adding pinned_at to room_members...');
        await db.query(`
            ALTER TABLE room_members 
            ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        `);
        console.log('Migration successful: pinned_at column added.');
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();

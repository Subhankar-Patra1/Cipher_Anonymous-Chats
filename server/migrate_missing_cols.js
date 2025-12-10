const db = require('./db');

async function migrate() {
    try {
        console.log('Starting migration: adding bio, edited_at, edit_version...');
        
        // Add bio to users
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
        `);
        console.log('Added bio to users.');

        // Add bio to rooms
        await db.query(`
            ALTER TABLE rooms 
            ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
        `);
        console.log('Added bio to rooms.');

        // Add editing columns to messages
        await db.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS edit_version INTEGER DEFAULT 0;
        `);
        console.log('Added editing columns to messages.');

        console.log('Migration successful.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();

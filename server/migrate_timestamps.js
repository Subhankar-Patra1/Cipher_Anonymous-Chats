const db = require('./db');

async function migrate() {
    try {
        // Add delivered_at JSONB column: { "userId": "timestamp", ... }
        await db.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS delivered_at JSONB DEFAULT '{}';
        `);
        console.log('Added delivered_at column (JSONB)');

        // Add viewed_at JSONB column: { "userId": "timestamp", ... }
        await db.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS viewed_at JSONB DEFAULT '{}';
        `);
        console.log('Added viewed_at column (JSONB)');

        console.log('Migration successful: Timestamp columns added.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();

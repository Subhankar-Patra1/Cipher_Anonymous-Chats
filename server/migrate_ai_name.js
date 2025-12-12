const db = require('./db');

async function migrate_ai_name() {
    try {
        console.log('Starting AI Name migration...');

        // Add ai_name column to ai_sessions if it doesn't exist
        await db.query(`
            ALTER TABLE ai_sessions 
            ADD COLUMN IF NOT EXISTS ai_name TEXT DEFAULT 'Sparkle AI';
        `);
        
        console.log('Added column: ai_name to ai_sessions');
        console.log('AI Name Migration successful.');
        process.exit(0);
    } catch (err) {
        console.error('AI Name Migration failed:', err);
        process.exit(1);
    }
}

migrate_ai_name();

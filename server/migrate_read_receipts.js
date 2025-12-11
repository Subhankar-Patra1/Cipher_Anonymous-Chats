const db = require('./db');

async function migrate() {
    try {
        console.log('Migrating read receipts...');
        
        // Add read_by column as integer[]
        // Initialize with empty array for existing rows
        await db.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS read_by INTEGER[] DEFAULT '{}'
        `);
        console.log('Added read_by column');
        
        console.log('Migration complete');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();

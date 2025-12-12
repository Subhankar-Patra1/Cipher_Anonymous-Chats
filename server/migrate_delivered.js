const db = require('./db');

async function migrate() {
    try {
        console.log('Migrating delivered status...');
        
        // Add delivered_to column as integer[]
        await db.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS delivered_to INTEGER[] DEFAULT '{}'
        `);
        console.log('Added delivered_to column');
        
        console.log('Migration complete');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();

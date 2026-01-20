const db = require('./db');

async function migrate() {
    try {
        console.log('Adding password_hint column to key_backups table...');
        await db.query(`
            ALTER TABLE key_backups 
            ADD COLUMN IF NOT EXISTS password_hint TEXT;
        `);
        console.log('Migration successful.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit();
    }
}

migrate();

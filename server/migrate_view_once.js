const db = require('./db');

const migrate = async () => {
    try {
        console.log('Migrating messages table for View Once feature...');

        await db.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS is_view_once BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS viewed_by INTEGER[] DEFAULT '{}';
        `);

        console.log('Migration successful: Added is_view_once and viewed_by columns.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();

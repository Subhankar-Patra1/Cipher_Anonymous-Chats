const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./db');

async function migrate() {
    try {
        console.log('Migrating rooms table for group avatars...');
        await db.query(`
            ALTER TABLE rooms ADD COLUMN IF NOT EXISTS avatar_url TEXT;
            ALTER TABLE rooms ADD COLUMN IF NOT EXISTS avatar_thumb_url TEXT;
            ALTER TABLE rooms ADD COLUMN IF NOT EXISTS avatar_key TEXT;
            ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
        `);
        console.log('Migration successful: Added avatar columns to rooms table.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit();
    }
}

migrate();

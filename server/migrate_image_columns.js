const db = require('./db');
require('dotenv').config();

const migrate = async () => {
    try {
        console.log('Migrating messages table for image support...');
        
        // Add image columns
        await db.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS image_url TEXT,
            ADD COLUMN IF NOT EXISTS image_width INTEGER,
            ADD COLUMN IF NOT EXISTS image_height INTEGER,
            ADD COLUMN IF NOT EXISTS image_size INTEGER,
            ADD COLUMN IF NOT EXISTS caption TEXT;
        `);

        console.log('Migration successful: Image columns added.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();

const pool = require('./db');

async function migrate() {
    console.log('Migrating: Adding media_cleared_at to room_members...');
    try {
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='room_members' AND column_name='media_cleared_at') THEN 
                    ALTER TABLE room_members ADD COLUMN media_cleared_at TIMESTAMPTZ DEFAULT NULL; 
                END IF; 
            END $$;
        `);
        console.log('Migration successful: media_cleared_at added.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        pool.end();
    }
}

migrate();

const db = require('./db');

async function migrate_ai() {
    try {
        console.log('Starting AI migration...');

        // 1. ai_sessions
        await db.query(`
            CREATE TABLE IF NOT EXISTS ai_sessions (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id int NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                room_id int NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                created_at timestamptz DEFAULT now(),
                last_used timestamptz DEFAULT now()
            );
        `);
        console.log('Created table: ai_sessions');

        // 2. ai_calls (audit)
        await db.query(`
            CREATE TABLE IF NOT EXISTS ai_calls (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id int,
                room_id int,
                operation_id text,
                model text,
                tokens_requested int,
                tokens_used int,
                status text,
                created_at timestamptz DEFAULT now()
            );
        `);
        console.log('Created table: ai_calls');

        console.log('AI Migration successful.');
        process.exit(0);
    } catch (err) {
        console.error('AI Migration failed:', err);
        process.exit(1);
    }
}

migrate_ai();

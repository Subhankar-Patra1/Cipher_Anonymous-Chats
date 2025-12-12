process.env.PGTZ = 'UTC'; // Force Postgres to treat timestamps as UTC
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});



pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Create tables
const createTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                recovery_code_hash TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                code TEXT UNIQUE,
                name TEXT,
                type TEXT CHECK(type IN ('group', 'direct')) NOT NULL,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                avatar_url TEXT,
                avatar_thumb_url TEXT,
                avatar_key TEXT,
                bio TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS room_members (
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                role TEXT DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (room_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                type TEXT DEFAULT 'text',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );


            -- Migration for existing users table
            ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_code_hash TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS share_presence TEXT DEFAULT 'everyone'; -- 'everyone'|'contacts'|'nobody'
            ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';

            -- Migration for messages table
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent'; -- sent, delivered, seen
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_to INTEGER[] DEFAULT '{}'; -- [NEW]
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id INTEGER REFERENCES messages(id);
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted_for_everyone BOOLEAN DEFAULT FALSE;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_user_ids TEXT[] DEFAULT '{}';
            -- Audio fields
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text'; -- Ensure type exists (already in create but good for migration)
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_url TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_duration_ms INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_waveform TEXT; -- JSON stringified array

            -- Migration for users table (Avatars)
            ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_thumb_url TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key TEXT;

            CREATE TABLE IF NOT EXISTS audio_play_state (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                heard_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, message_id)
            );

            -- Migration for room_members (Chat Visibility)
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP DEFAULT NULL;
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
             
            -- Migration for messages (Editing)
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS edit_version INTEGER DEFAULT 0;

            CREATE TABLE IF NOT EXISTS group_permissions (
                group_id INTEGER PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
                allow_name_change BOOLEAN DEFAULT TRUE,
                allow_description_change BOOLEAN DEFAULT TRUE,
                allow_add_members BOOLEAN DEFAULT TRUE,
                allow_remove_members BOOLEAN DEFAULT TRUE,
                send_mode VARCHAR(16) DEFAULT 'everyone',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Tables created successfully");
    } catch (err) {
        console.error("Error creating tables:", err);
    }
};

// Initialize tables on startup
createTables();

module.exports = {
    query: (text, params) => pool.query(text, params),
};

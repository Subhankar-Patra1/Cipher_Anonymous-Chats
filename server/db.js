process.env.PGTZ = 'UTC'; // Force Postgres to treat timestamps as UTC
const { Pool, types } = require('pg');

// Force timestamp (1114) to be parsed as UTC string
types.setTypeParser(1114, (str) => {
    return str + 'Z'; // Append Z so JS treats it as UTC
});
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // [FIX] Connection pool resilience for Supabase pooler
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});



pool.on('error', (err, client) => {
    // [FIX] Don't crash on "Tenant or user not found" — it's a transient Supabase pooler error
    if (err.message && err.message.includes('Tenant or user not found')) {
        console.error('[DB] Supabase pooler error: Tenant or user not found. Check your DATABASE_URL credentials and ensure the Supabase project is active.');
        return; // Don't exit — allow the app to retry on next request
    }
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

            ALTER TABLE users ADD COLUMN IF NOT EXISTS group_add_privacy TEXT DEFAULT 'everyone';

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
            
            -- [NEW] Block persistence: messages sent while blocked should never be shown to blocker
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS blocked_for_user_id INTEGER REFERENCES users(id);
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_view_once BOOLEAN DEFAULT FALSE;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS viewed_by INTEGER[] DEFAULT '{}';
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS mention_user_ids INTEGER[] DEFAULT '{}';
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB;

            -- [NEW] Missing Message Columns (Media, Files, E2EE, Location, AI)
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_width INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_height INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_size INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS caption TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_type TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_extension TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS gif_url TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS preview_url TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS width INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS height INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS address TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS temp_id TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS ciphertext TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS iv TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS salt TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS key_version INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta_type TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS signature TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS signature_version INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_device_id TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS distribution_headers TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta JSONB;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_name TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by INTEGER REFERENCES users(id);
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS pin_expires_at TIMESTAMP;

            ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS edit_version INTEGER DEFAULT 0;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id INTEGER;

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

            CREATE TABLE IF NOT EXISTS message_reactions (
                id SERIAL PRIMARY KEY,
                message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                reaction TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(message_id, user_id)
            );

            -- Migration for room_members (Chat Visibility and Pinning)
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP DEFAULT NULL;
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP;
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN DEFAULT TRUE;
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS media_cleared_at TIMESTAMP;
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_read_message_id INTEGER;

            -- [NEW] Migration for rooms (Ordering)
            ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            
            -- Backfill last_message_at if it's default (creation time) but messages exist
            DO $$
            BEGIN
                -- Only run if there are rooms where last_message_at is potentially stale or default
                -- We update all rooms to be safe, setting it to the MAX(message.created_at)
                UPDATE rooms r
                SET last_message_at = (
                    SELECT COALESCE(MAX(m.created_at), r.created_at)
                    FROM messages m
                    WHERE m.room_id = r.id
                );
            END $$;
             
            -- Migration for messages (Editing)
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS edit_version INTEGER DEFAULT 0;

            -- Migration for messages (Images & Attachments)
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_width INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_height INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_size INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS caption TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

            -- Migration for messages (Files)
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size INTEGER;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_type TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_extension TEXT;

            -- [NEW E2EE] Client-generated ID for Replay Protection & Encryption Salt
            -- Must be UNIQUE to prevent replay attacks (Same ID cannot be inserted twice)
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS temp_id UUID;
            
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'messages_temp_id_key'
                ) THEN
                    ALTER TABLE messages ADD CONSTRAINT messages_temp_id_key UNIQUE (temp_id);
                END IF;
            END $$;

            CREATE TABLE IF NOT EXISTS group_permissions (
                group_id INTEGER PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
                allow_name_change BOOLEAN DEFAULT TRUE,
                allow_description_change BOOLEAN DEFAULT TRUE,
                allow_add_members BOOLEAN DEFAULT TRUE,
                allow_remove_members BOOLEAN DEFAULT TRUE,
                send_mode VARCHAR(16) DEFAULT 'everyone',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Secret Chats: Individual chat lock per user
            CREATE TABLE IF NOT EXISTS chat_locks (
                id SERIAL PRIMARY KEY,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                passcode_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(room_id, user_id)
            );

            -- Blocked Users
            CREATE TABLE IF NOT EXISTS blocked_users (
                blocker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                blocked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (blocker_id, blocked_id)
            );

            -- [NEW] User Sessions (Linked Devices)
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                device_name TEXT,
                device_type TEXT, -- desktop, mobile, tablet
                os TEXT,
                browser TEXT,
                ip_address TEXT,
                location TEXT,
                last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- [NEW] User Chat Preferences (Colour, Wallpaper)
            CREATE TABLE IF NOT EXISTS user_chat_preferences (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                bubble_color TEXT,
                wallpaper TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, room_id)
            );

            -- [NEW] Privacy Migrations
            ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pic_privacy TEXT DEFAULT 'everyone'; -- everyone, contacts, nobody
            ALTER TABLE users ADD COLUMN IF NOT EXISTS new_chat_privacy TEXT DEFAULT 'everyone'; -- everyone, contacts, nobody
            ALTER TABLE users ADD COLUMN IF NOT EXISTS search_privacy TEXT DEFAULT 'everyone'; -- everyone, nobody
            ALTER TABLE users ADD COLUMN IF NOT EXISTS calls_privacy TEXT DEFAULT 'everyone'; -- everyone, contacts, nobody
            ALTER TABLE users ADD COLUMN IF NOT EXISTS group_add_privacy TEXT DEFAULT 'everyone'; -- everyone, contacts, nobody
            ALTER TABLE users ADD COLUMN IF NOT EXISTS read_receipts BOOLEAN DEFAULT TRUE;
            
            ALTER TABLE room_members ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN DEFAULT TRUE;
            
            CREATE TABLE IF NOT EXISTS user_privacy_exceptions (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                excluded_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                privacy_type TEXT DEFAULT 'profile_pic',
                exception_type TEXT DEFAULT 'never_allow',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE user_privacy_exceptions ADD COLUMN IF NOT EXISTS privacy_type TEXT DEFAULT 'profile_pic';
            ALTER TABLE user_privacy_exceptions ADD COLUMN IF NOT EXISTS exception_type TEXT DEFAULT 'never_allow';
            -- Ensure primary key (might fail if already exists or data conflicts, but for dev it is ok)
            -- ALTER TABLE user_privacy_exceptions ADD PRIMARY KEY (user_id, excluded_user_id, privacy_type); 

            CREATE TABLE IF NOT EXISTS starred_messages (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, message_id)
            );

            -- [PHASE 2] Cloud Backup
            CREATE TABLE IF NOT EXISTS key_backups (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                encrypted_blob TEXT NOT NULL,
                salt TEXT NOT NULL,
                iv TEXT NOT NULL,
                password_hint TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- [NEW] Global Auto-Backup State
            ALTER TABLE key_backups ADD COLUMN IF NOT EXISTS is_auto_sync_enabled BOOLEAN DEFAULT TRUE;

            -- [OAuth] Add email column to users table
            ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_method VARCHAR(50) DEFAULT 'password';

            -- [FIX] Profile completion flag for OAuth onboarding race condition
            -- Defaults to TRUE so existing users are unaffected
            ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT TRUE;
            -- Make password_hash nullable for OAuth-only users
            DO $$
            BEGIN
                ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
            EXCEPTION
                WHEN others THEN NULL;
            END $$;

            -- [OAuth] OAuth Accounts Table
            CREATE TABLE IF NOT EXISTS oauth_accounts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                provider VARCHAR(50) NOT NULL,
                provider_user_id VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                display_name VARCHAR(255),
                avatar_url TEXT,
                access_token TEXT,
                refresh_token TEXT,
                token_expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider, provider_user_id)
            );

            -- [OAuth] Session Table for Passport.js
            CREATE TABLE IF NOT EXISTS session (
                sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
                sess JSON NOT NULL,
                expire TIMESTAMP(6) NOT NULL
            );
            CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

            -- [NEW] User Photos (Multiple Profile Photos like Telegram)
            CREATE TABLE IF NOT EXISTS user_photos (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                photo_url TEXT NOT NULL,
                thumb_url TEXT NOT NULL,
                photo_key TEXT NOT NULL,
                is_main BOOLEAN DEFAULT FALSE,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_user_photos_user_id ON user_photos(user_id);

            -- [NEW] Call Logs
            CREATE TABLE IF NOT EXISTS calls (
                id SERIAL PRIMARY KEY,
                caller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
                type VARCHAR(20) NOT NULL, -- audio, video
                status VARCHAR(20) NOT NULL, -- missed, completed, busy, rejected
                started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMPTZ,
                duration INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id);
            CREATE INDEX IF NOT EXISTS idx_calls_receiver ON calls(receiver_id);

            -- [NEW] Todos Feature
            CREATE TABLE IF NOT EXISTS todos (
                id SERIAL PRIMARY KEY,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                created_by INTEGER REFERENCES users(id),
                title TEXT,
                message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL, -- Link to the chat message
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS todo_items (
                id SERIAL PRIMARY KEY,
                todo_id INTEGER REFERENCES todos(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_by INTEGER REFERENCES users(id),
                completed_at TIMESTAMP,
                order_index INTEGER DEFAULT 0
            );
            -- [NEW] QR Code Login Sessions
            CREATE TABLE IF NOT EXISTS qr_login_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                token VARCHAR(64) UNIQUE NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL,
                confirmed_by_user_id INTEGER REFERENCES users(id),
                new_device_info JSONB,
                auth_token TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_qr_login_sessions_token ON qr_login_sessions(token);

            -- [NEW] User Devices
            CREATE TABLE IF NOT EXISTS user_devices (
                id TEXT PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                public_key TEXT NOT NULL,
                signing_public_key TEXT,
                label TEXT,
                last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- [NEW] AI Sessions
            CREATE TABLE IF NOT EXISTS ai_sessions (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                ai_name TEXT DEFAULT 'Sparkle AI',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, room_id)
            );

            -- [NEW] Message Deliveries
            CREATE TABLE IF NOT EXISTS message_deliveries (
                message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(message_id, user_id)
            );
            
            -- [NEW] Polls
            CREATE TABLE IF NOT EXISTS polls (
                id SERIAL PRIMARY KEY,
                message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                question TEXT NOT NULL,
                created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
                is_multiple_choice BOOLEAN DEFAULT FALSE,
                is_anonymous BOOLEAN DEFAULT FALSE,
                is_closed BOOLEAN DEFAULT FALSE,
                closed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS poll_options (
                id SERIAL PRIMARY KEY,
                poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
                option_text TEXT NOT NULL,
                option_order INTEGER DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS poll_votes (
                id SERIAL PRIMARY KEY,
                poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
                option_id INTEGER REFERENCES poll_options(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(poll_id, user_id, option_id)
            );
            
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id INTEGER REFERENCES polls(id);

            -- [FIX] Allow 'ai' as a room type
            ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_type_check;
            ALTER TABLE rooms ADD CONSTRAINT rooms_type_check CHECK(type IN ('group', 'direct', 'ai'));

            -- [PERFORMANCE] Indexes for faster room list and unread counts
            CREATE INDEX IF NOT EXISTS idx_messages_room_id_created_at ON messages(room_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
            
            -- [PERFORMANCE] Index for faster login username lookup
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

            -- [NEW] Missing Tables (Privacy, Preferences, E2EE, Permissions)
            CREATE TABLE IF NOT EXISTS blocked_users (
                blocker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                blocked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (blocker_id, blocked_id)
            );

            CREATE TABLE IF NOT EXISTS user_privacy_exceptions (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                excluded_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                privacy_type TEXT NOT NULL,
                exception_type TEXT NOT NULL,
                scope TEXT,
                PRIMARY KEY (user_id, excluded_user_id, privacy_type)
            );

            CREATE TABLE IF NOT EXISTS group_permissions (
                group_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE PRIMARY KEY,
                allow_name_change BOOLEAN DEFAULT TRUE,
                allow_description_change BOOLEAN DEFAULT TRUE,
                allow_add_members BOOLEAN DEFAULT TRUE,
                allow_remove_members BOOLEAN DEFAULT TRUE,
                send_mode TEXT DEFAULT 'everyone'
            );

            CREATE TABLE IF NOT EXISTS starred_messages (
                message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS chat_locks (
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                passcode_hash TEXT NOT NULL,
                PRIMARY KEY (room_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_chat_preferences (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                bubble_color TEXT,
                wallpaper TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, room_id)
            );

            CREATE TABLE IF NOT EXISTS room_key_versions (
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                version INTEGER,
                created_by_device_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (room_id, version)
            );

            CREATE TABLE IF NOT EXISTS room_keys (
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                device_id TEXT,
                encrypted_key TEXT NOT NULL,
                key_version INTEGER,
                PRIMARY KEY (room_id, device_id, key_version)
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
    pool
};

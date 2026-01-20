require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const migrate = async () => {
    try {
        console.log("Starting E2EE Schema Migration...");

        // 1. Create user_devices table
        console.log("Creating user_devices table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_devices (
                id UUID PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                public_key TEXT NOT NULL,
                label TEXT,
                last_active_at TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. Create room_keys table
        console.log("Creating room_keys table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS room_keys (
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                device_id UUID REFERENCES user_devices(id) ON DELETE CASCADE,
                encrypted_key TEXT NOT NULL,
                key_version BIGINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (room_id, device_id, key_version)
            );
        `);

        // 3. Update messages table
        console.log("Updating messages table columns...");
        await pool.query(`
            ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS ciphertext TEXT,
            ADD COLUMN IF NOT EXISTS iv TEXT,
            ADD COLUMN IF NOT EXISTS salt TEXT,
            ADD COLUMN IF NOT EXISTS sender_device_id UUID,
            ADD COLUMN IF NOT EXISTS key_version BIGINT,
            ADD COLUMN IF NOT EXISTS meta_type TEXT,
            ADD COLUMN IF NOT EXISTS meta_reply_to_id UUID,
            ADD COLUMN IF NOT EXISTS meta_is_edited BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS distribution_headers JSONB;
        `);
        
        console.log("Loosening Not-Null constraint on messages.content...");
        // Handle case where constraint might not exist or named differently, 
        // but 'ALTER COLUMN ... DROP NOT NULL' is generally safe in PG if it's already nullable
        await pool.query(`
            ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
        `);

        // [FIX] Convert key_version from INTEGER to BIGINT for timestamp support
        console.log("Converting key_version columns to BIGINT...");
        await pool.query(`
            ALTER TABLE room_keys ALTER COLUMN key_version TYPE BIGINT;
            ALTER TABLE messages ALTER COLUMN key_version TYPE BIGINT;
        `);

        // [NEW] Ed25519 Sender Authentication
        console.log("Adding signature columns for sender authentication...");
        await pool.query(`
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS signature TEXT;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS signature_version INTEGER DEFAULT 1;
            ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS signing_public_key TEXT;
        `);

        // [NEW] Key Version Control (Race Condition Protection)
        console.log("Creating room_key_versions table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS room_key_versions (
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                version BIGINT NOT NULL,
                created_by_device_id UUID REFERENCES user_devices(id),
                created_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (room_id, version)
            );
        `);

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await pool.end();
    }
};

migrate();

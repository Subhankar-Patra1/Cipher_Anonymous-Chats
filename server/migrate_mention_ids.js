require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const migrate = async () => {
    try {
        console.log("Starting Mention IDs Migration...");

        // Add mention_user_ids column to messages table
        // We use INTEGER[] for performance and query simplicity with ANY()
        await pool.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS mention_user_ids INTEGER[];
        `);

        // Index for performance (optional but recommended for large datasets)
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_mentions ON messages USING GIN (mention_user_ids);
        `);

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await pool.end();
    }
};

migrate();

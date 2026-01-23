const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Adjust based on your environment
});

const migrate = async () => {
    try {
        console.log("Applying Schema Fix: room_key_versions ON DELETE SET NULL...");

        await pool.query(`
            -- Remove the strict rule that causes the error
            ALTER TABLE room_key_versions
            DROP CONSTRAINT IF EXISTS room_key_versions_created_by_device_id_fkey;

            -- Add the "Smart" rule: If a device is deleted, set the key creator to NULL
            ALTER TABLE room_key_versions
            ADD CONSTRAINT room_key_versions_created_by_device_id_fkey
            FOREIGN KEY (created_by_device_id)
            REFERENCES user_devices(id)
            ON DELETE SET NULL;
        `);

        console.log("Schema fix applied successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await pool.end();
    }
};

migrate();

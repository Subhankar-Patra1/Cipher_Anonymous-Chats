const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log('Starting delivery backfill...');
        
        // 1. Get all messages with non-empty read_by or viewed_by
        const res = await pool.query(`
            SELECT id, user_id, read_by, viewed_by, created_at 
            FROM messages 
            WHERE array_length(read_by, 1) > 0 OR array_length(viewed_by, 1) > 0
        `);

        console.log(`Found ${res.rowCount} messages with interactions.`);

        let insertedCount = 0;

        for (const row of res.rows) {
            const receiverIds = new Set();
            const senderId = String(row.user_id);

            // Add read_by users
            if (Array.isArray(row.read_by)) {
                row.read_by.forEach(uid => {
                    const sUid = String(uid);
                    if (sUid !== senderId) receiverIds.add(sUid);
                });
            }
            
            // Add viewed_by users
            if (Array.isArray(row.viewed_by)) {
                row.viewed_by.forEach(uid => {
                    const sUid = String(uid);
                    if (sUid !== senderId) receiverIds.add(sUid);
                });
            }

            for (const uidStr of receiverIds) {
                // Skip if not a number
                if (!/^\d+$/.test(uidStr)) continue;
                
                const uid = parseInt(uidStr);

                // Insert into message_deliveries
                // We use created_at as the 'delivered_at' timestamp for backfilled items
                // to avoid "delivered just now" for year-old messages.
                await pool.query(`
                    INSERT INTO message_deliveries (message_id, user_id, delivered_at)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (message_id, user_id) DO NOTHING
                `, [row.id, uid, row.created_at]);
                
                insertedCount++;
            }
        }

        console.log(`Backfill complete. Inserted/Ignored ${insertedCount} delivery records.`);

    } catch (e) {
        console.error('Backfill error:', e);
    } finally {
        pool.end();
    }
}

run();

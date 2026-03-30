const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function repairAndVerify() {
    try {
        console.log("Applying repairs to 'user_privacy_exceptions'...");
        await pool.query("ALTER TABLE user_privacy_exceptions ADD COLUMN IF NOT EXISTS privacy_type TEXT DEFAULT 'profile_pic'");
        await pool.query("ALTER TABLE user_privacy_exceptions ADD COLUMN IF NOT EXISTS exception_type TEXT DEFAULT 'never_allow'");
        
        console.log("\n--- TABLE: user_privacy_exceptions (POST-REPAIR) ---");
        const exceptionsCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_privacy_exceptions'
            ORDER BY column_name;
        `);
        exceptionsCols.rows.forEach(r => console.log(`Col: ${r.column_name}`));

    } catch (err) {
        console.error("Repair failed:", err);
    } finally {
        await pool.end();
    }
}

repairAndVerify();

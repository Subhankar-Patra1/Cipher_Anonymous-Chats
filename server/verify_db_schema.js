require('dotenv').config();
const db = require('./db');

async function checkSchema() {
    try {
        const res = await db.query(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'search_privacy'"
        );
        
        if (res.rows.length > 0) {
            console.log('PASS: search_privacy column exists.');
            console.log(res.rows[0]);
        } else {
            console.error('FAIL: search_privacy column MISSING.');
        }
    } catch (err) {
        console.error('Error checking schema:', err);
    } finally {
        process.exit();
    }
}

checkSchema();

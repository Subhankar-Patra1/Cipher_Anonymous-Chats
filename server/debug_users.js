require('dotenv').config();
const db = require('./db');

async function checkUsers() {
    try {
        const res = await db.query('SELECT id, username FROM users order by id');
        // Simple console log line by line
        res.rows.forEach(r => console.log(`${r.id}: ${r.username}`));
    } catch (err) {
        console.error(err);
    }
}

checkUsers();

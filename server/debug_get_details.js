const db = require('./db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function getDetails() {
    try {
        const res = await db.query(`
            SELECT m.room_id, m.user_id 
            FROM messages m 
            WHERE m.type = 'image' 
            LIMIT 1
        `);
        
        if (res.rows.length === 0) {
            console.log("No image messages found.");
            return;
        }

        const { room_id, user_id } = res.rows[0];
        console.log(`RoomID: ${room_id}, UserID: ${user_id}`);

        const token = jwt.sign({ id: user_id }, process.env.JWT_SECRET || 'supersecretkey');
        console.log(`Token: ${token}`);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

getDetails();

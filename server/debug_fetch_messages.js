const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const roomId = 74;
const userId = 14;
const token = jwt.sign({ id: userId }, process.env.JWT_SECRET || 'supersecretkey');


async function run() {
    console.log("Fetching messages for room", roomId);
    try {
        const res = await fetch(`http://localhost:3000/api/rooms/${roomId}/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            console.log("Error:", res.status, res.statusText);
            return;
        }

        const messages = await res.json();
        const images = messages.filter(m => m.type === 'image');
        
        const output = images.slice(-3);
        fs.writeFileSync('debug_output.json', JSON.stringify(output, null, 2));
        console.log("Written to debug_output.json");

    } catch (err) {
        console.error("Fetch Error:", err.message);
    }
}
run();

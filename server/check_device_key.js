const db = require('./db');

const deviceId = '64818eb9-cd27-412e-b244-32bbdf52198d';

async function checkDevice() {
    try {
        const res = await db.query('SELECT * FROM user_devices WHERE id = $1', [deviceId]);
        console.log(res.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => process.exit(), 500);
    }
}

checkDevice();

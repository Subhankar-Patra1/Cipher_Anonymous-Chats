const db = require('./db');
const fs = require('fs');

async function checkMember() {
    try {
        // 1. Get User ID from Device
        const deviceRes = await db.query("SELECT user_id, id FROM user_devices WHERE id = '64818eb9-cd27-412e-b244-32bbdf52198d'");
        const device = deviceRes.rows[0];
        if (!device) { console.log('Device not found'); return; }
        
        const userRes = await db.query("SELECT id, username FROM users WHERE id = $1", [device.user_id]);
        const user = userRes.rows[0];
        console.log('User:', user);

        // 2. Search Rooms created by this User
        // Get all rooms created by user to avoid ambiguity
        const roomRes = await db.query("SELECT id, name, code, created_by FROM rooms WHERE created_by = $1", [user.id]);
        console.log('Rooms created by me:', roomRes.rows);

        if (roomRes.rows.length === 0) {
            console.log('User has created NO rooms.');
            return;
        }

        const myRoom = roomRes.rows[0]; // Pick first
        console.log('My Room:', myRoom);

        // 3. Check Membership in THAT room
        const memberRes = await db.query("SELECT * FROM room_members WHERE user_id = $1 AND room_id = $2", [user.id, myRoom.id]);
        console.log('Member Row:', memberRes.rows[0]);

        // 4. Check Device in List Query
        const devices = await db.query(`
            SELECT ud.id as "deviceId", ud.user_id as "userId", ud.public_key as "publicKey", ud.signing_public_key as "signingPublicKey"
            FROM user_devices ud
            JOIN room_members rm ON ud.user_id = rm.user_id
            WHERE rm.room_id = $1
        `, [myRoom.id]);
        
        console.log('Devices found count:', devices.rows.length);
        
        const result = {
            user,
            myRoom,
            roomMemberRow: memberRes.rows[0],
            devices: devices.rows
        };
        
        fs.writeFileSync('member_check_result.txt', JSON.stringify(result, null, 2));
        console.log('Done writing member_check_result.txt');

    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => process.exit(), 500);
    }
}

checkMember();

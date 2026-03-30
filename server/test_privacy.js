const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function test() {
    try {
        const users = await pool.query('SELECT id, username, avatar_url FROM users LIMIT 2');
        if (users.rows.length < 2) {
            console.log("Not enough users to test.");
            return;
        }

        const userA = users.rows[0];
        const userB = users.rows[1];

        console.log(`Testing with User A: ${userA.username} (${userA.id}) and User B: ${userB.username} (${userB.id})`);

        // Helper to check what User B sees when looking at User A
        const checkVisibility = async () => {
             // Mocking the logic in users.js:327
             const userRes = await pool.query('SELECT *, profile_pic_privacy FROM users WHERE id = $1', [userA.id]);
             const targetUser = userRes.rows[0];
             const requesterId = userB.id;
             const targetUserId = userA.id;

             let shouldHideAvatar = false;
             if (targetUser.profile_pic_privacy === 'nobody') {
                 shouldHideAvatar = true;
             } else if (targetUser.profile_pic_privacy === 'contacts') {
                 const contactCheck = await pool.query(`
                     SELECT 1 FROM room_participants rp1
                     JOIN room_participants rp2 ON rp1.room_id = rp2.room_id
                     JOIN rooms r ON r.id = rp1.room_id
                     WHERE rp1.user_id = $1 AND rp2.user_id = $2 AND r.type = 'dm'
                 `, [targetUserId, requesterId]);
                 if (contactCheck.rows.length === 0) shouldHideAvatar = true;
             }

             if (!shouldHideAvatar) {
                 const exceptionCheck = await pool.query(`
                     SELECT 1 FROM user_privacy_exceptions 
                     WHERE user_id = $1 AND excluded_user_id = $2 AND privacy_type = 'profile_pic'
                 `, [targetUserId, requesterId]);
                 if (exceptionCheck.rows.length > 0) shouldHideAvatar = true;
             }

             return shouldHideAvatar;
        };

        // Case 1: Nobody
        await pool.query('UPDATE users SET profile_pic_privacy = $1 WHERE id = $2', ['nobody', userA.id]);
        const hidden1 = await checkVisibility();
        console.log("Case 1 (Nobody) - Is Hidden:", hidden1, hidden1 === true ? "(PASS)" : "(FAIL)");

        // Case 2: Everyone + Exception
        await pool.query('UPDATE users SET profile_pic_privacy = $1 WHERE id = $2', ['everyone', userA.id]);
        await pool.query('DELETE FROM user_privacy_exceptions WHERE user_id = $1', [userA.id]);
        
        // Use COALESCE or provide 'scope' just in case it is NOT NULL
        await pool.query(`
            INSERT INTO user_privacy_exceptions (user_id, excluded_user_id, privacy_type, scope) 
            VALUES ($1, $2, $3, $4)
        `, [userA.id, userB.id, 'profile_pic', 'profile_pic']);

        const hidden2 = await checkVisibility();
        console.log("Case 2 (Everyone + Exception) - Is Hidden:", hidden2, hidden2 === true ? "(PASS)" : "(FAIL)");

        // Case 3: Everyone (No Exception)
        await pool.query('DELETE FROM user_privacy_exceptions WHERE user_id = $1', [userA.id]);
        const hidden3 = await checkVisibility();
        console.log("Case 3 (Everyone) - Is Hidden:", hidden3, hidden3 === false ? "(PASS)" : "(FAIL)");

    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        await pool.end();
    }
}

test();

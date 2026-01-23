const db = require('./db');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('--- USER RESET TOOL ---');
console.log('WARNING: This will delete a user and all their sessions/data.');
console.log('Use this to test the "New User Onboarding" flow with an existing Google/GitHub account.');

rl.question('Enter the EMAIL of the user to delete: ', async (email) => {
    try {
        if (!email) {
            console.log('No email provided. Exiting.');
            process.exit(0);
        }

        console.log(`Searching for user with email: ${email}...`);
        
        // 1. Find User
        const res = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (res.rows.length === 0) {
            console.error('User not found!');
            process.exit(1);
        }
        
        const user = res.rows[0];
        console.log(`Found User: ${user.display_name} (ID: ${user.id})`);

        // 2. Delete
        // We need to cascade delete manually if foreign keys cascade isn't set up, 
        // but let's assume standard cascading or just delete the user row.
        // Actually best to use the API logic but here we just want a quick purge.
        
        console.log('Deleting...');
        // Delete OAuth accounts first
        await db.query('DELETE FROM oauth_accounts WHERE user_id = $1', [user.id]);
        // Delete Sessions
        await db.query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
        // Delete User
        await db.query('DELETE FROM users WHERE id = $1', [user.id]);

        console.log('✅ User deleted successfully.');
        console.log('You can now sign in with this email again to trigger the "User Onboarding" flow.');

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        rl.close();
        // Force exit
        setTimeout(() => process.exit(0), 1000);
    }
});

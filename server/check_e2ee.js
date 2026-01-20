const db = require('./db');

(async () => {
    try {
        const res = await db.query(`
            SELECT id, type, created_at, content, ciphertext 
            FROM messages 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        console.log('--- START RESULT ---');
        console.log(JSON.stringify(res.rows, null, 2));
        console.log('--- END RESULT ---');
    } catch (e) {
        console.error(e);
    } finally {
        // [FIX] Ensure output is flushed before exit
        setTimeout(() => process.exit(0), 1000);
    }
})();

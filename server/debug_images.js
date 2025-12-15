const db = require('./db');

async function inspectImages() {
    try {
        const res = await db.query(`
            SELECT id, type, image_url, created_at 
            FROM messages 
            WHERE type = 'image' 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        console.log("Recent Image Messages:");
        res.rows.forEach(r => {
            console.log(`[${r.id}] ${r.created_at}: ${r.image_url}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

inspectImages();

const db = require('./db');
const { getKeyFromUrl, checkObjectExists, generateGetPresignedUrl } = require('./s3');

async function debug() {
    try {
        const res = await db.query(`
            SELECT id, image_url, created_at 
            FROM messages 
            WHERE type = 'image' 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        
        if (res.rows.length === 0) {
            console.log("No images found in DB.");
            return;
        }

        const msg = res.rows[0];
        console.log("Found Message:", msg.id);
        console.log("URL from DB:", msg.image_url);

        const key = getKeyFromUrl(msg.image_url);
        console.log("Extracted Key:", key);

        if (!key) {
            console.log("Could not extract key!");
            return;
        }

        const exists = await checkObjectExists(key);
        console.log("Object Exists in S3?", exists);

        if (exists) {
            const signedUrl = await generateGetPresignedUrl(key);
            console.log("Generated Signed URL:", signedUrl);
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
}

debug();

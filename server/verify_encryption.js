const db = require('./db');

async function checkEncryption() {
    try {
        console.log('--- Verifying E2EE Storage ---');
        const res = await db.query(`
            SELECT 
                id, 
                left(content, 20) as content_preview, 
                left(ciphertext, 20) as ciphertext_start, 
                type,
                created_at 
            FROM messages 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        
        const fs = require('fs');
        const results = res.rows.map(row => ({
            id: row.id,
            type: row.type,
            time: row.created_at.toISOString(),
            IS_ENCRYPTED: row.content === null && row.ciphertext_start !== null ? '✅ YES' : '❌ NO',
            content_stored: row.content_preview === null ? '(NULL)' : row.content_preview,
            ciphertext_stored: row.ciphertext_start ? row.ciphertext_start + '...' : '(NULL)'
        }));
        fs.writeFileSync('results.txt', JSON.stringify(results, null, 2));
        console.log('Done writing results.txt');
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkEncryption();

const { Pool } = require('pg');
const crypto = require('crypto');
const { webcrypto } = crypto;
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

// Mock CryptoManager Utils
function canonicalizeMessage(ciphertext, iv, tempId, keyVersion) {
    return `${ciphertext}|${iv}|${tempId}|${keyVersion}`;
}

function base64ToArrayBuffer(base64) {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

function atob(str) {
    return Buffer.from(str, 'base64').toString('binary');
}

async function verify(ciphertext, iv, tempId, keyVersion, signatureBase64, signingPublicKeyBase64) {
    try {
        console.log(`Verifying: TempId=${tempId} Ver=${keyVersion} SigLen=${signatureBase64.length}`);
        
        const keyBuffer = base64ToArrayBuffer(signingPublicKeyBase64);
        const signatureBuffer = base64ToArrayBuffer(signatureBase64);
        
        const publicKey = await webcrypto.subtle.importKey(
            "spki",
            keyBuffer,
            "Ed25519",
            true,
            ["verify"]
        );

        const data = canonicalizeMessage(ciphertext, iv, tempId, keyVersion);
        console.log(`Canonical Data: "${data}"`);
        
        const encoded = new TextEncoder().encode(data);

        const isValid = await webcrypto.subtle.verify(
            "Ed25519",
            publicKey,
            signatureBuffer,
            encoded
        );
        
        console.log(`Result: ${isValid ? 'VALID' : 'INVALID'}`);
        return isValid;

    } catch(e) {
        console.error('Verify failed:', e);
    }
}

async function check() {
    try {
        // 1. Get recent message with signature
        const res = await pool.query(`
            SELECT m.id, m.temp_id, m.ciphertext, m.iv, m.key_version, m.signature, m.sender_device_id,
                   d.signing_public_key
            FROM messages m
            JOIN user_devices d ON m.sender_device_id = d.id
            WHERE m.signature IS NOT NULL
            ORDER BY m.created_at DESC 
            LIMIT 1;
        `);
        
        if (res.rows.length === 0) {
            console.log('No signed messages found.');
            return;
        }

        const msg = res.rows[0];
        console.log('Found ID:', msg.id, 'TempID:', msg.temp_id);
        
        if (!msg.signing_public_key) {
             console.error('Missing signing key for device');
             return;
        }

        // Try Verify with DB TempID
        await verify(msg.ciphertext, msg.iv, msg.temp_id, msg.key_version, msg.signature, msg.signing_public_key);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

check();

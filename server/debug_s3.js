const { uploadFile } = require('./s3');
const fs = require('fs');

async function test() {
    console.log("Testing S3 Upload...");
    try {
        const buffer = Buffer.from("Test audio content");
        const url = await uploadFile(buffer, "test-audio.txt", "text/plain");
        console.log("Success! URL:", url);
    } catch (err) {
        console.error("S3 Verification Failed:", err);
    }
}

test();

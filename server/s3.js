const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, PutBucketCorsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = process.env.AWS_BUCKET_NAME;

const missingVars = [];
if (!region) missingVars.push('AWS_REGION');
if (!accessKeyId) missingVars.push('AWS_ACCESS_KEY_ID');
if (!secretAccessKey) missingVars.push('AWS_SECRET_ACCESS_KEY');
if (!bucketName) missingVars.push('AWS_BUCKET_NAME');

if (missingVars.length > 0) {
    console.error(`[S3 Error] Missing AWS environment variables: ${missingVars.join(', ')}. Audio/Image uploads will fail.`);
}

const s3Client = new S3Client({
    region,
    credentials: {
        accessKeyId,
        secretAccessKey
    }
});

const configureBucketCors = async () => {
    try {
        const command = new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
                        AllowedOrigins: ["*"], // For dev. In prod, lock this down.
                        ExposeHeaders: ["ETag"],
                        MaxAgeSeconds: 3000
                    }
                ]
            }
        });
        await s3Client.send(command);
        console.log("S3 Bucket CORS updated successfully.");
    } catch (err) {
        console.error("Failed to update S3 Bucket CORS:", err);
        // Don't throw, just log. Might fail if permissions are missing.
    }
};

const uploadFile = async (fileBuffer, fileName, mimeType) => {
    const uploadParams = {
        Bucket: bucketName,
        Body: fileBuffer,
        Key: fileName,
        ContentType: mimeType,
        CacheControl: 'max-age=31536000' // cache for 1 year
    };

    try {
        await s3Client.send(new PutObjectCommand(uploadParams));
        const url = `https://${bucketName}.s3.${region}.amazonaws.com/${fileName}`;
        return url;
    } catch (err) {
        console.error("S3 Upload Error", err);
        throw err;
    }
};

const generatePresignedUrl = async (key, contentType, expiresIn = 300) => {
    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
        // ACL is tricky with buckets blocking public ACLs.
        // Usually better to rely on bucket policy. Omitting ACL here unless specified.
    });

    try {
        const url = await getSignedUrl(s3Client, command, { expiresIn });
        return url;
    } catch (err) {
        console.error("Presigned URL Error", err);
        throw err;
    }
};

const generateGetPresignedUrl = async (key, expiresIn = 3600 * 24 * 7) => { // Default to 7 days
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key
    });

    try {
        const url = await getSignedUrl(s3Client, command, { expiresIn });
        return url;
    } catch (err) {
        console.error("Get Presigned URL Error", err);
        throw err;
    }
};

const getKeyFromUrl = (url) => {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        // Pattern: https://bucket.s3.region.amazonaws.com/KEY
        // pathname is /KEY
        return urlObj.pathname.substring(1); // Remove leading slash
    } catch (e) {
        // Fallback for string matching if URL parse fails or format differs
        const base = `https://${bucketName}.s3.${region}.amazonaws.com/`;
        if (url.startsWith(base)) {
            return url.substring(base.length);
        }
        return null; // Not an S3 URL from this bucket
    }
};

const checkObjectExists = async (key) => {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: bucketName,
            Key: key
        }));
        return true;
    } catch (err) {
        if (err.name === 'NotFound' || err.name === 'NoSuchKey') return false;
        throw err; // Permissions or other error
    }
};

const deleteObject = async (key) => {
    try {
        await s3Client.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key
        }));
        return true;
    } catch (err) {
        console.error("S3 Delete Error", err);
        throw err;
    }
};

module.exports = { 
    uploadFile,
    generatePresignedUrl,
    generateGetPresignedUrl,
    getKeyFromUrl,
    checkObjectExists,
    deleteObject,
    configureBucketCors,
    bucketName,
    region
};

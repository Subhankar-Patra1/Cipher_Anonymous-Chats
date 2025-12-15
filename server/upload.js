const multer = require('multer');

// Store file in memory to pass to S3
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        console.log("Checking file type:", file.mimetype, "Original name:", file.originalname);
        if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            console.error("File rejected. Mime:", file.mimetype);
            cb(new Error('Only audio and image files are allowed!'), false);
        }
    }
});

module.exports = upload;

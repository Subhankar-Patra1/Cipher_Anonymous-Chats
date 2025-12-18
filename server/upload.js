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
        const mime = file.mimetype;
        const name = file.originalname.toLowerCase();
        
        // Block executables
        if (
            mime === 'application/x-msdownload' || 
            mime === 'application/x-sh' || 
            mime === 'application/x-bat' ||
            name.endsWith('.exe') ||
            name.endsWith('.bat') ||
            name.endsWith('.sh') ||
            name.endsWith('.cmd') ||
            name.endsWith('.msi')
        ) {
            console.error("File rejected (executable). Mime:", mime);
            cb(new Error('Executable files are not allowed!'), false);
            return;
        }
        
        // Allow everything else
        cb(null, true);
    }
});

module.exports = upload;

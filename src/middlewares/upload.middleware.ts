import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Ensure upload directories exist
const activitiesUploadDir = path.join(process.cwd(), 'public', 'uploads', 'activities');
fs.mkdirSync(activitiesUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'photo' || file.fieldname === 'photos') {
      cb(null, activitiesUploadDir);
    } else {
      cb(null, path.join(process.cwd(), 'public', 'uploads'));
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

export default upload;

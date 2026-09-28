const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|heic|heif/;
  
  // File extension check (.jpg, .jpeg, .png)
  const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  // Mimetype check (handles Postman boundary/octet-stream quirks)
  const isImageMime = file.mimetype.startsWith('image/') || file.mimetype === 'application/octet-stream';

  if (extName && isImageMime) {
    return cb(null, true);
  }
  
  cb(new Error('Only image files (JPEG/JPG/PNG) are allowed!'), false);
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, 
  fileFilter
});

module.exports = upload;
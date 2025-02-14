import { Router } from 'express';
import multer from 'multer';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
}).single('thumbnail');

// Handle thumbnail uploads
router.patch('/:videoId/thumbnail', (req, res) => {
  // Handle file upload
  upload(req, res, async (err) => {
    try {
      // Log request details
      console.log('Processing thumbnail request:', {
        videoId: req.params.videoId,
        contentType: req.headers['content-type']
      });

      // Handle multer errors
      if (err) {
        console.error('Upload error:', err);
        throw err;
      }

      // Check for file presence
      if (!req.file) {
        throw new Error('No file uploaded');
      }

      // Convert file to base64
      const base64Data = req.file.buffer.toString('base64');
      const thumbnailUrl = `data:${req.file.mimetype};base64,${base64Data}`;

      // Log success
      console.log('Thumbnail processed successfully:', {
        videoId: req.params.videoId,
        size: req.file.size,
        mimeType: req.file.mimetype
      });

      return res.json({
        success: true,
        thumbnailUrl
      });
    } catch (error) {
      console.error('Error in thumbnail upload:', error);
      return res.status(error instanceof multer.MulterError ? 400 : 500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process thumbnail'
      });
    }
  });
});

export default router;
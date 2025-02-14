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

router.patch('/:videoId/thumbnail', (req, res) => {
  upload(req, res, (err) => {
    // Set content type before any response
    res.setHeader('Content-Type', 'application/json');

    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        error: 'File too large (max 5MB)'
      });
    }

    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    try {
      // Create data URL from the uploaded file
      const thumbnailUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

      console.log('Thumbnail processed successfully:', {
        videoId: req.params.videoId,
        mimeType: req.file.mimetype,
        size: req.file.size
      });

      return res.json({
        success: true,
        thumbnailUrl
      });
    } catch (error) {
      console.error('Thumbnail processing error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to process thumbnail'
      });
    }
  });
});

export default router;
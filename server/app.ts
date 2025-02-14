import express from 'express';
import thumbnailRoutes from './routes/thumbnail';
import { setupAuth } from './auth';
import multer from 'multer';

const app = express();

// Increase body parser size limits for large payloads (100MB)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Force JSON content type for all responses as early as possible
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Setup authentication
setupAuth(app);

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if (req.originalUrl.includes('thumbnail')) {
    console.log('Thumbnail request details:', {
      method: req.method,
      path: req.originalUrl,
      contentType: req.headers['content-type'],
      hasBody: req.body !== undefined,
      hasFile: req.file !== undefined
    });
  }
  next();
});

// Global error handler for multer and other errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Ensure JSON response
  res.setHeader('Content-Type', 'application/json');

  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  // For any other error
  console.error('Server error:', err);
  const status = err.status || 500;
  const message = err.message || 'An unexpected error occurred';

  return res.status(status).json({
    success: false,
    error: status === 500 ? 'Server error' : message,
    details: status === 500 ? message : undefined
  });
});

// Register routes after error handlers
app.use('/api/thumbnails', thumbnailRoutes);

// Start server on 0.0.0.0 to make it accessible
const port = parseInt(process.env.PORT || '5000', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on port ${port}`);
});

export default app;
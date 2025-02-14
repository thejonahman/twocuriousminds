import express from 'express';
import thumbnailRoutes from './routes/thumbnail';
import { setupAuth } from './auth';
import multer from 'multer';

const app = express();

// Increase body parser size limits for large payloads (100MB)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Setup authentication BEFORE registering routes
setupAuth(app);

// Force JSON responses for all /api routes
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Request logger for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if (req.originalUrl.includes('/thumbnail')) {
    console.log('Thumbnail request details:', {
      method: req.method,
      path: req.originalUrl,
      contentType: req.headers['content-type'],
      hasFile: req.file !== undefined,
    });
  }
  next();
});

// Handle multer errors before routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({
      error: err.message 
    });
  }
  next(err);
});

// Register thumbnail routes
app.use('/api/thumbnails', thumbnailRoutes);

// Catch-all error handler for unhandled errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);

  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');

  // Handle other errors
  const status = err.status || 500;
  const message = err.message || 'An unexpected error occurred';

  res.status(status).json({
    error: status === 500 ? 'Server error' : message,
    details: status === 500 ? message : undefined
  });
});

// Catch unhandled rejections and exceptions
process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
});

export default app;
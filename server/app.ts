import express from 'express';
import thumbnailRoutes from './routes/thumbnail';
import { setupAuth } from './auth';

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

// Register thumbnail routes
app.use('/api/thumbnails', thumbnailRoutes);

// Catch-all error handler for unhandled errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);

  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');

  // Handle multer errors specifically
  if (err instanceof Error && err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      details: err.message
    });
  }

  // Handle other errors
  const status = err.status || 500;
  const message = err.message || 'An unexpected error occurred';

  res.status(status).json({
    success: false,
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
import express from 'express';
import thumbnailRoutes from './routes/thumbnail';

const app = express();

// Ensure JSON body parsing is enabled
app.use(express.json());

// Set response type for all thumbnail routes to JSON
app.use('/api/thumbnails', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Register thumbnail routes
app.use('/api/thumbnails', thumbnailRoutes);

// Generic error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);

  // Ensure we haven't already sent headers
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      success: false,
      error: 'Server error',
      details: err.message || 'An unexpected error occurred'
    });
  }
});

export default app;
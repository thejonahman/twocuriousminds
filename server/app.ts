import express from 'express';
import { setupAuth } from './auth';

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup authentication
setupAuth(app);

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Simple error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Server error'
  });
});

// Handle errors when no route matches
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
});

// Start server
const port = parseInt(process.env.PORT || '5000', 10);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[Server] Starting up on port ${port}`);
  console.log(`[Server] Server is ready at http://0.0.0.0:${port}`);
  console.log('[Server] Ready for connections');
}).on('error', (err: Error) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
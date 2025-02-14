import express from 'express';
import { createServer } from "http";
import { setupAuth } from './auth';
import { registerRoutes } from './routes';
import path from 'path';
import fs from 'fs';

const app = express();
const httpServer = createServer(app);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup static file serving for uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Setup authentication
setupAuth(app);

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Register all routes
registerRoutes(app);

// Simple error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Handle errors when no route matches
app.use((req, res) => {
  console.log('404 Not Found:', req.originalUrl);
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
});

// Start server
const port = parseInt(process.env.PORT || '3000', 10);

// Added more detailed logging for server startup
const server = httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Server started on port ${port}`);
  console.log(`Upload directory: ${uploadsDir}`);
  console.log(`Server is now accepting connections on 0.0.0.0:${port}`);
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
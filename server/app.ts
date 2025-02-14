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

// Request logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);

  // Log response details after request is complete
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} completed with status ${res.statusCode} in ${duration}ms`);
  });
  next();
});

// Setup static file serving for uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Setup authentication
setupAuth(app);

// Register all routes
registerRoutes(app);

// Global error handler for API routes
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body
  });
  res.status(500).json({
    success: false,
    error: 'API error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Simple error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });
  res.status(500).json({
    success: false,
    error: 'Server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Handle errors when no route matches
app.use((req, res) => {
  console.log('[404] Not Found:', req.originalUrl);
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
});

// Start server
const port = parseInt(process.env.PORT || '3000', 10);
let server: ReturnType<typeof httpServer.listen>;

function startServer() {
  return new Promise((resolve, reject) => {
    console.log(`[SERVER] Starting on port ${port}...`);

    server = httpServer.listen({ 
      port, 
      host: '0.0.0.0',
      ipv6Only: false
    }, () => {
      console.log(`[SERVER] Upload directory: ${uploadsDir}`);
      console.log(`[SERVER] Server is now accepting connections`);
      resolve(server);
    });

    server.on('error', (err: Error) => {
      console.error('[SERVER] Failed to start:', err);
      reject(err);
    });
  });
}

// Start server and verify it's running
async function init() {
  try {
    await startServer();
    console.log('[SERVER] Successfully started and verified');
  } catch (err) {
    console.error('[SERVER] Failed to start server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully');
  if (server) {
    server.close(() => {
      console.log('[SERVER] Server closed');
      process.exit(0);
    });
  }
});

init();

export default app;
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupWebSocketServer } from "./websocket";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed request logging middleware with error tracking
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[REQUEST] ${req.method} ${req.path}`, {
    headers: req.headers,
    query: req.query,
    timestamp: new Date().toISOString()
  });

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[COMPLETE] ${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
  });

  next();
});

// Register routes first to get access to the session middleware
const { server, sessionMiddleware } = registerRoutes(app);

// Global error handler with better logging
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Application Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  if (req.path.startsWith('/api')) {
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      success: false
    });
  } else {
    next(err);
  }
});

// Setup Vite with error handling
if (app.get("env") === "development") {
  try {
    setupVite(app, server);
  } catch (error) {
    console.error('Vite setup failed:', error);
    process.exit(1);
  }
} else {
  serveStatic(app);
}

// Server startup with proper port binding and health checks
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Create a Promise that resolves when the server is ready
const serverReady = new Promise((resolve, reject) => {
  let wss: any;
  let startupAttempts = 0;
  const MAX_STARTUP_ATTEMPTS = 5;
  const RETRY_DELAY = 1000; // 1 second

  const startServer = () => {
    try {
      // Close server if it's already listening
      if (server.listening) {
        server.close();
      }

      server.listen(PORT, HOST, () => {
        console.log(`Server running at http://${HOST}:${PORT}`, {
          env: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        });

        // Initialize WebSocket server after HTTP server is ready
        wss = setupWebSocketServer(server, sessionMiddleware);
        console.log('[WebSocket] Server initialized');

        // Add a basic health check endpoint
        app.get('/health', (req, res) => {
          res.json({
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
          });
        });

        // Signal that the server is ready
        if (process.send) {
          process.send('ready');
        }

        resolve(true);
      });

      // Handle server-level errors
      server.on('error', (error: any) => {
        console.error('Server error:', {
          error: error.message,
          code: error.code,
          timestamp: new Date().toISOString()
        });
        handleStartupError(error);
      });

    } catch (error) {
      console.error('Server startup attempt failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      handleStartupError(error);
    }
  };

  const handleStartupError = (error: any) => {
    if (error.code === 'EADDRINUSE') {
      if (startupAttempts < MAX_STARTUP_ATTEMPTS) {
        startupAttempts++;
        console.log(`Port ${PORT} is busy, retrying in ${RETRY_DELAY}ms... (Attempt ${startupAttempts}/${MAX_STARTUP_ATTEMPTS})`);
        setTimeout(startServer, RETRY_DELAY);
      } else {
        const errorMessage = `Could not bind to port ${PORT} after ${MAX_STARTUP_ATTEMPTS} attempts`;
        console.error(errorMessage);
        reject(new Error(errorMessage));
      }
    } else {
      console.error('Fatal server startup error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      reject(error);
    }
  };

  // Start the server
  startServer();
});

// Graceful shutdown handler with WebSocket cleanup
const shutdown = () => {
  console.log('Shutting down server...', {
    timestamp: new Date().toISOString()
  });

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Export the server and ready promise for testing
export { server, serverReady };
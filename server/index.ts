import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupWebSocketServer } from "./websocket";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[REQUEST] ${req.method} ${req.path}`);

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[COMPLETE] ${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
  });

  next();
});

// Register routes first to get access to the session middleware
const { server, sessionMiddleware } = registerRoutes(app);

// API error handler
app.use('/api', (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    success: false
  });
});

// Setup Vite
if (app.get("env") === "development") {
  setupVite(app, server);
} else {
  serveStatic(app);
}

// Server startup with proper port binding
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Create a Promise that resolves when the server is ready
const serverReady = new Promise((resolve, reject) => {
  server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);

    // Initialize WebSocket server after HTTP server is ready
    const wss = setupWebSocketServer(server, sessionMiddleware);
    console.log('[WebSocket] Server initialized');

    // Signal that the server is ready
    if (process.send) {
      process.send('ready');
    }

    resolve(true);
  });

  server.on('error', (error: Error) => {
    console.error('Server startup error:', error);
    reject(error);
  });
});

// Basic shutdown handling
const shutdown = () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Export the server and ready promise for testing
export { server, serverReady };
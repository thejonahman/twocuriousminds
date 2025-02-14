import express, { type Request, Response, NextFunction } from "express";
import routes from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from './auth';
import { setupWebSocketServer } from './websocket';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const method = req.method;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Log request details
  console.log(`[REQUEST] ${method} ${path}`, {
    headers: req.headers,
    query: req.query,
    body: req.body
  });

  // Capture response data
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    console.log(`[RESPONSE] ${method} ${path} will send JSON:`, bodyJson);
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  // Log response details
  res.on("finish", () => {
    const duration = Date.now() - start;
    const contentType = res.get('Content-Type');
    const status = res.statusCode;

    console.log(`[COMPLETE] ${method} ${path}`, {
      status,
      duration: `${duration}ms`,
      contentType,
      isApiRoute: path.startsWith("/api"),
      responseType: capturedJsonResponse ? 'json' : 'non-json'
    });
  });

  next();
});

// Setup authentication
const sessionMiddleware = setupAuth(app);

// Register WebSocket server
setupWebSocketServer(server, sessionMiddleware);

// Register all API routes - this must come before any catch-all handlers
console.log('[SERVER] Registering API routes...');
app.use(routes);

// Add API-specific error handler for /api routes
app.use('/api', (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', {
    path: req.path,
    method: req.method,
    error: err,
    stack: err.stack
  });

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(status)
     .set('Content-Type', 'application/json')
     .json({
       error: message,
       success: false
     });
});

// Setup Vite for development or serve static files for production
if (app.get("env") === "development") {
  console.log('[SERVER] Setting up Vite for development...');
  setupVite(app, server);
} else {
  console.log('[SERVER] Setting up static file serving for production...');
  serveStatic(app);
}

// Add catch-all handler for /api routes after all other middleware
app.use('/api/*', (req: Request, res: Response) => {
  console.log(`[404] No API route found for ${req.method} ${req.path}`);
  res.status(404)
     .set('Content-Type', 'application/json')
     .json({
       error: 'API endpoint not found',
       success: false,
       path: req.path,
       method: req.method
     });
});

const PORT = 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[SERVER] Server started on port ${PORT}`);
  log(`serving on port ${PORT} (0.0.0.0)`);
});

export default server;
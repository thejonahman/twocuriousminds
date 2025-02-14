import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
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

    if (path.startsWith("/api")) {
      let logLine = `${method} ${path} ${status} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Ensure all API routes are registered before Vite middleware
const server = registerRoutes(app);

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

  // Ensure we always return JSON for API routes
  res.status(status)
     .set('Content-Type', 'application/json')
     .json({
       error: message,
       success: false
     });
});

// Add catch-all handler for /api routes to prevent falling through to Vite
app.use('/api/*', (req: Request, res: Response) => {
  console.log(`[404] No API route found for ${req.method} ${req.path}`);
  res.status(404)
     .set('Content-Type', 'application/json')
     .json({
       error: 'API endpoint not found',
       success: false
     });
});

// Setup Vite only after API routes are registered
if (app.get("env") === "development") {
  setupVite(app, server);
} else {
  serveStatic(app);
}

const PORT = 5000;
server.listen(PORT, "0.0.0.0", () => {
  log(`serving on port ${PORT} (0.0.0.0)`);
});
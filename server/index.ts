import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { createServer as createNetServer, type Server as NetServer } from 'net';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const method = req.method;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Enhanced logging for debugging
  console.log(`[REQUEST] ${method} ${path}`, {
    timestamp: new Date().toISOString(),
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

  // Log response details with enhanced information
  res.on("finish", () => {
    const duration = Date.now() - start;
    const contentType = res.get('Content-Type');
    const status = res.statusCode;

    console.log(`[COMPLETE] ${method} ${path}`, {
      timestamp: new Date().toISOString(),
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
    timestamp: new Date().toISOString(),
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
      success: false,
      timestamp: new Date().toISOString()
    });
});

// Add catch-all handler for /api routes to prevent falling through to Vite
app.use('/api/*', (req: Request, res: Response) => {
  console.log(`[404] No API route found for ${req.method} ${req.path}`);
  res.status(404)
    .set('Content-Type', 'application/json')
    .json({
      error: 'API endpoint not found',
      success: false,
      timestamp: new Date().toISOString()
    });
});

// Setup Vite only after API routes are registered
if (app.get("env") === "development") {
  setupVite(app, server);
} else {
  serveStatic(app);
}

// Configure the port and host for better accessibility
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Function to check if port is in use using ESM
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester: NetServer = createNetServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.once('close', () => resolve(false)).close();
      })
      .listen(port);
  });
}

// Function to find an available port
async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (await isPortInUse(port)) {
    port++;
    if (port > startPort + 100) { // Don't search indefinitely
      throw new Error('No available ports found in range');
    }
  }
  return port;
}

let shutdownInProgress = false;

// Convert function declaration to function expression
const handleShutdown = () => {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Forcing server shutdown');
    process.exit(1);
  }, 5000);
};

// Start server with port availability check and explicit host binding
const startServer = async () => {
  try {
    const port = await findAvailablePort(PORT);
    if (port !== PORT) {
      console.log(`Port ${PORT} was in use, using port ${port} instead`);
    }

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);

    // Create a promise that resolves when the server is listening
    const serverReady = new Promise<void>((resolve) => {
      server.listen(port, HOST, () => {
        const startupMessage = `Server started and ready on http://${HOST}:${port}`;
        log(startupMessage);
        console.log('=== Server Configuration ===');
        console.log(`Environment: ${app.get("env")}`);
        console.log(`Port: ${port}`);
        console.log(`Host: ${HOST}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log('=========================');
        console.log('Server is now ready to accept connections');
        resolve();
      });
    });

    // Wait for server to be ready before signaling
    await serverReady;

    // Signal that the server is ready (for workflow port waiting)
    if (process.send) {
      process.send('ready');
      console.log('Sent ready signal to parent process');
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
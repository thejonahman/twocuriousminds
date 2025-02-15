import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

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

// Register routes
const server = registerRoutes(app);

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

// Simple server startup
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  if (process.send) {
    process.send('ready');
  }
});

// Basic shutdown handling
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => process.exit(0));
});
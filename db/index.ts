import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./schema";

// Configure neon to use websockets and proper security settings
neonConfig.webSocketConstructor = ws;
neonConfig.useSecureWebSocket = true;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure the connection pool with optimized settings for Neon
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: true,
  idleTimeoutMillis: 30000,
  max: 10,
  connectionTimeoutMillis: 10000,
});

// Add error logging for connection issues
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Initialize drizzle with the pool and schema
export const db = drizzle(pool, { schema });
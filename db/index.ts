import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "./schema";

// Add logging for database connection debugging
console.log('Initializing database connection...');
console.log('Using database URL:', process.env.DATABASE_URL?.split('@')[1]); // Log only host part for security

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Conservative pool configuration for sleeping endpoints
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2, // Minimize concurrent connections
  idleTimeoutMillis: 60000, // 1 minute
  connectionTimeoutMillis: 60000, // 1 minute
  ssl: {
    rejectUnauthorized: false
  },
  statement_timeout: 120000, // 2 minutes
  query_timeout: 120000, // 2 minutes
});

// Export the drizzle instance
export const db = drizzle(pool, { schema });

// Add a health check function
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Monitor pool health periodically
const MONITORING_INTERVAL = 15000; // 15 seconds
setInterval(() => {
  const poolStatus = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
  console.log('Pool status:', poolStatus);
}, MONITORING_INTERVAL);

// Add pool event handlers
pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
});

pool.on('connect', () => {
  console.log('New client connected to pool');
});

pool.on('acquire', () => {
  console.log('Client acquired from pool');
});

pool.on('remove', () => {
  console.log('Client removed from pool');
});
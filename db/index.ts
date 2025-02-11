import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "./schema";

console.log('Initializing database connection...');
console.log('Using database URL:', process.env.DATABASE_URL?.split('@')[1]); // Log only host part for security

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure pool with settings optimized for Neon serverless
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, // Minimize connections for serverless
  idleTimeoutMillis: 20000, // Lower timeout for serverless
  connectionTimeoutMillis: 10000,
  ssl: {
    rejectUnauthorized: false // Required for Neon
  }
});

// Export the drizzle instance
export const db = drizzle(pool, { schema });

// Add a health check function
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT 1');
    client.release();
    console.log('Database health check succeeded:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Monitor pool events for better debugging
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

// Perform initial health check
isDatabaseHealthy()
  .then(healthy => {
    if (healthy) {
      console.log('Database connection initialized successfully');
    } else {
      console.error('Failed to establish database connection');
    }
  })
  .catch(error => {
    console.error('Error during initial database health check:', error);
  });

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
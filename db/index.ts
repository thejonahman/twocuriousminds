import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "./schema";

console.log('Initializing database connection...');

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Simple pool configuration
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: {
    rejectUnauthorized: false
  }
});

// Export the drizzle instance
export const db = drizzle(pool, { schema });

// Basic health check function
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT 1');
    client.release();
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Basic error handler
pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
});

// Initial health check
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
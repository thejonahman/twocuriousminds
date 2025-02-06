import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "./schema";

// Add logging for database connection debugging
console.log('Initializing database connection...');

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create a new pool using DATABASE_URL with increased timeouts
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 60000, // Increased idle timeout to 1 minute
  connectionTimeoutMillis: 10000, // Increased connection timeout to 10 seconds
  ssl: {
    rejectUnauthorized: false // Allow self-signed certificates
  }
});

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit the process, just log the error
  console.error('Database connection error:', err);
});

// Test the connection with retries
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

async function connectWithRetry(retries = MAX_RETRIES) {
  try {
    const client = await pool.connect();
    console.log('Database connection successful');
    client.release();
  } catch (err) {
    console.error(`Database connection attempt failed (${MAX_RETRIES - retries + 1}/${MAX_RETRIES}):`, err);
    if (retries > 1) {
      console.log(`Retrying in ${RETRY_DELAY/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      await connectWithRetry(retries - 1);
    } else {
      console.error('All database connection attempts failed');
      throw err;
    }
  }
}

// Initialize connection
connectWithRetry()
  .catch(err => {
    console.error('Fatal database connection error:', err);
    process.exit(1);
  });

export const db = drizzle(pool, { schema });
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

// Enhanced pool configuration with conservative settings for sleeping endpoints
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3, // Further reduce max connections to prevent overwhelming the endpoint
  idleTimeoutMillis: 10000, // 10 seconds
  connectionTimeoutMillis: 10000, // 10 seconds
  maxUses: 7500,
  ssl: {
    rejectUnauthorized: false
  },
  statement_timeout: 30000,
  query_timeout: 30000,
  application_name: 'video_learning_platform',
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000 // Shorter delay for faster endpoint wake-up
});

// Add query logging middleware with detailed error tracking
const originalQuery = pool.query.bind(pool);
pool.query = (...args: any[]) => {
  const start = Date.now();
  const query = args[0]?.text || args[0];
  console.log('Executing query:', query);

  return originalQuery(...args)
    .then((result: any) => {
      const duration = Date.now() - start;
      console.log(`Query completed in ${duration}ms:`, query);
      return result;
    })
    .catch((error: any) => {
      const duration = Date.now() - start;
      console.error(`Query failed after ${duration}ms:`, query);
      console.error('Error details:', error);

      // Special handling for endpoint disabled errors
      if (error.message?.includes('endpoint is disabled')) {
        console.log('Database endpoint is disabled, waiting for activation...');
        // Return a promise that will retry after a delay
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            console.log('Retrying query after endpoint disabled error');
            pool.query(...args).then(resolve).catch(reject);
          }, 5000); // Wait 5 seconds before retrying
        });
      }

      throw error;
    });
};

// Enhanced error handling for the pool
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  if (client) {
    console.log('Releasing client due to error');
    client.release(true);
  }
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

// Test the connection with improved retry logic for sleeping endpoints
const MAX_RETRIES = 5; // Reduced retries for faster feedback
const INITIAL_RETRY_DELAY = 2000; // Start with 2 seconds
const MAX_RETRY_DELAY = 15000; // Cap at 15 seconds

async function connectWithRetry(retries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY) {
  try {
    console.log('Attempting database connection...');
    const client = await pool.connect();
    console.log('Database connection successful');

    // Test query to verify connection
    await client.query('SELECT 1');
    console.log('Database query test successful');

    client.release();
    return true;
  } catch (err) {
    console.error(`Database connection attempt failed (${MAX_RETRIES - retries + 1}/${MAX_RETRIES}):`, err);

    if (retries > 1) {
      const nextDelay = Math.min(delay * 1.5, MAX_RETRY_DELAY); // Gentler backoff
      console.log(`Retrying in ${nextDelay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      return connectWithRetry(retries - 1, nextDelay);
    } else {
      console.error('All database connection attempts failed');
      throw err;
    }
  }
}

// Initialize connection with retry logic
const INITIAL_WARMUP_DELAY = 5000; // Increased initial delay to 5 seconds
console.log(`Waiting ${INITIAL_WARMUP_DELAY/1000} seconds for endpoint initialization...`);

setTimeout(() => {
  connectWithRetry()
    .then(() => {
      console.log('Database connection initialization complete');
    })
    .catch(err => {
      console.error('Fatal database connection error:', err);
      process.exit(1);
    });
}, INITIAL_WARMUP_DELAY);

// Monitor pool health more frequently during startup
const MONITORING_INTERVAL = 15000; // 15 seconds
setInterval(() => {
  const poolStatus = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
  console.log('Pool status:', poolStatus);
}, MONITORING_INTERVAL);

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
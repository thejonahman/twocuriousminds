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

// Enhanced pool configuration with more conservative settings
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Reduce max connections
  idleTimeoutMillis: 30000, // 30 seconds
  connectionTimeoutMillis: 5000, // 5 seconds
  maxUses: 7500,
  ssl: {
    rejectUnauthorized: false // Required for some PostgreSQL providers
  },
  statement_timeout: 30000, // 30 seconds
  query_timeout: 30000, // 30 seconds
  application_name: 'video_learning_platform',
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Add query logging middleware with error tracking
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

// Test the connection with retries and exponential backoff
const MAX_RETRIES = 5; // Increased from 3
const INITIAL_RETRY_DELAY = 1000; // Start with 1 second

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
      console.log(`Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return connectWithRetry(retries - 1, Math.min(delay * 2, 30000)); // Cap at 30 seconds
    } else {
      console.error('All database connection attempts failed');
      throw err;
    }
  }
}

// Initialize connection with retry logic
connectWithRetry()
  .then(() => {
    console.log('Database connection initialization complete');
  })
  .catch(err => {
    console.error('Fatal database connection error:', err);
    process.exit(1);
  });

// Monitor pool health every 30 seconds
setInterval(() => {
  const poolStatus = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
  console.log('Pool status:', poolStatus);
}, 30000);

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
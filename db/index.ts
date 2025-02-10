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

// Enhanced pool configuration with optimized settings
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed (30 sec)
  connectionTimeoutMillis: 10000, // How long to wait for connection (10 sec)
  maxUses: 7500, // Number of times a client can be used before being destroyed
  ssl: {
    rejectUnauthorized: false // Allow self-signed certificates
  },
  statement_timeout: 30000, // Maximum time for queries to run (30 sec)
  query_timeout: 30000, // Maximum time to wait for query execution (30 sec)
  application_name: 'ski_learning_platform', // Identify app in pg_stat_activity
  keepAlive: true, // Enable keep-alive
  keepAliveInitialDelayMillis: 10000 // Initial delay before first keep-alive probe
});

// Add query logging middleware
const originalQuery = pool.query.bind(pool);
pool.query = (...args: any[]) => {
  const start = Date.now();
  const query = args[0]?.text || args[0];

  return originalQuery(...args)
    .then((result: any) => {
      const duration = Date.now() - start;
      console.log(`Query executed in ${duration}ms:`, query);
      return result;
    })
    .catch((error: any) => {
      const duration = Date.now() - start;
      console.error(`Query failed after ${duration}ms:`, query, error);
      throw error;
    });
};

// Enhanced error handling for the pool
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  if (client) {
    client.release(true); // Force release with error
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
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

async function connectWithRetry(retries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY) {
  try {
    const client = await pool.connect();
    console.log('Database connection successful');

    // Test query to verify connection
    await client.query('SELECT 1');

    client.release();
  } catch (err) {
    console.error(`Database connection attempt failed (${MAX_RETRIES - retries + 1}/${MAX_RETRIES}):`, err);
    if (retries > 1) {
      console.log(`Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      await connectWithRetry(retries - 1, delay * 2); // Exponential backoff
    } else {
      console.error('All database connection attempts failed');
      throw err;
    }
  }
}

// Initialize connection with retry logic
connectWithRetry()
  .catch(err => {
    console.error('Fatal database connection error:', err);
    process.exit(1);
  });

// Add connection pool monitoring
setInterval(() => {
  const poolStatus = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
  console.log('Pool status:', poolStatus);
}, 60000); // Log every minute

export const db = drizzle(pool, { schema });
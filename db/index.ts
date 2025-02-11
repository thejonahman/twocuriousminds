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

      // Special handling for endpoint disabled errors with exponential backoff
      if (error.message?.includes('endpoint is disabled')) {
        console.log('Database endpoint is disabled, retrying with backoff...');
        return new Promise((resolve, reject) => {
          const retryWithBackoff = (attempt = 1, delay = 1000) => {
            console.log(`Retry attempt ${attempt} after ${delay}ms`);
            setTimeout(() => {
              pool.query(...args)
                .then(resolve)
                .catch(err => {
                  if (err.message?.includes('endpoint is disabled') && attempt < 5) {
                    retryWithBackoff(attempt + 1, Math.min(delay * 2, 10000));
                  } else {
                    reject(err);
                  }
                });
            }, delay);
          };
          retryWithBackoff();
        });
      }

      throw error;
    });
};

// Add error handling for the pool with reconnection logic
pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
  // Don't exit process, just log the error and let the pool handle reconnection
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
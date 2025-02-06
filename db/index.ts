import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure connection pool with retries and better error handling
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 5000, // How long to wait for connection
  retryDelay: 1000, // Delay between connection retries
  maxRetries: 3, // Maximum number of retries
};

// Create connection pool with error handling
export const pool = new Pool(poolConfig);

// Add event listeners for pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Wrap database initialization in a function that retries on failure
async function initializeDatabase() {
  let retries = poolConfig.maxRetries;
  while (retries > 0) {
    try {
      // Test the connection
      await pool.query('SELECT 1');
      console.log('Database connection established successfully');
      return drizzle({ client: pool, schema });
    } catch (error) {
      retries--;
      console.error(`Database connection failed. Retries left: ${retries}`, error);
      if (retries === 0) throw error;
      await new Promise(resolve => setTimeout(resolve, poolConfig.retryDelay));
    }
  }
  throw new Error('Failed to initialize database after maximum retries');
}

// Export the database instance with retry mechanism
export const db = await initializeDatabase();
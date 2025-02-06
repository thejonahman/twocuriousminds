import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create connection pool with basic settings
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10
});

// Export the database instance
export const db = drizzle(pool, { schema });
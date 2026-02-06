import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL ||
  process.env.SUPABASE_DIRECT_URL ||
  process.env.SUPABASE_CONNECTION_STRING;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL, SUPABASE_DIRECT_URL, or SUPABASE_CONNECTION_STRING must be set.",
  );
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  // Supabase-specific settings for better connection handling
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  max: 20,
});

export const db = drizzle(pool, { schema });

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 20000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error", err);
});

process.on("beforeExit", async () => {
  await pool.end();
});

export const db = drizzle(pool, { schema });

export * from "./schema";

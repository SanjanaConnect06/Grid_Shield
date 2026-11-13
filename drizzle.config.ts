import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Match Next.js local setup: process environment wins, then .env.local, then .env.
config({ path: [".env.local", ".env"], quiet: true });
if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL in .env.local before running database commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL },
});

import { defineConfig } from "drizzle-kit";

const localDirectUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? localDirectUrl,
  },
  strict: true,
  verbose: true,
});

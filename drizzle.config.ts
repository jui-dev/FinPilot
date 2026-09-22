import { defineConfig } from "drizzle-kit";

// Used only to generate reviewable SQL migrations (never `push`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  strict: true,
  verbose: true,
});

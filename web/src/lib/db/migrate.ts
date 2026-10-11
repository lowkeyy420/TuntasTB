import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies all pending migrations in ./drizzle, then exits.
 * Run by the container entrypoint before the server starts, and via
 * `npm run db:migrate` locally. Safe to run repeatedly: Drizzle records
 * applied migrations and skips them.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to run migrations");
    process.exit(1);
  }

  const migrationClient = postgres(url, { max: 1 });
  const dbm = drizzle(migrationClient);
  try {
    await migrate(dbm, { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await migrationClient.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

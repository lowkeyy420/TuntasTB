import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import { backfillPickups } from "./service";

/**
 * One-off: creates the first pickup of every patient registered before the
 * pickup planner existed. Safe to run any number of times.
 *   npm run pickups:backfill
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  try {
    const created = await backfillPickups(drizzle(client, { schema }) as unknown as Database);
    console.log(`pickups created: ${created}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/lib/config";
import * as schema from "./schema";

/**
 * Shared Postgres client and Drizzle instance.
 *
 * Created lazily on first use (not at import time) so that build-time page
 * data collection, which imports route modules, does not open a connection or
 * require env to be present. A single pooled client is reused thereafter.
 */
let instance: PostgresJsDatabase<typeof schema> | undefined;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!instance) {
    const client = postgres(config.DATABASE_URL, { max: 10 });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop: string | symbol) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
export type Database = PostgresJsDatabase<typeof schema>;

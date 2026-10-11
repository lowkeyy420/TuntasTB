import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { computeHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

const LANGFLOW_PROBE_TIMEOUT_MS = 2000;

async function pingDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

async function probeLangflow(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LANGFLOW_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.LANGFLOW_BASE_URL}/health`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const report = await computeHealth({
    pingDatabase,
    probeLangflow,
    rulesOnly: config.rulesOnly,
  });

  return NextResponse.json(
    {
      status: report.status,
      database: report.database,
      langflow: report.langflow,
    },
    { status: report.httpStatus },
  );
}

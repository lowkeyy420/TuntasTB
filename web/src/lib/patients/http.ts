import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { requireNurse, UnauthorizedError } from "@/lib/auth/requireNurse";
import type { NurseSession } from "./service";

/** Small helpers shared by the nurse patient routes. */

export const NO_STORE = { "cache-control": "no-store" } as const;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export const notFound = () => json({ error: "not found" }, 404);

/** Returns the nurse session, or a ready 401 response. */
export async function authNurse(
  request: Request,
): Promise<{ session: NurseSession } | { response: NextResponse }> {
  try {
    const session = await requireNurse(request, config.SESSION_SECRET);
    return { session };
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return { response: json({ error: "unauthorized" }, 401) };
    }
    throw e;
  }
}

/** True when `id` is a UUID; anything else cannot match a row, so it is a 404. */
export const isUuid = (id: string) => z.string().uuid().safeParse(id).success;

export async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

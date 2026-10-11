import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { readSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit/audit";

export const dynamic = "force-dynamic";

function sessionCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}

export async function POST(request: Request) {
  const payload = await readSession(
    sessionCookie(request),
    config.SESSION_SECRET,
  );
  if (payload) {
    await audit(db, {
      actor: `nurse:${payload.nurseId}`,
      action: "auth.logout",
      target: `nurse:${payload.nurseId}`,
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: config.APP_BASE_URL.startsWith("https"),
    path: "/",
    maxAge: 0,
  });
  return res;
}

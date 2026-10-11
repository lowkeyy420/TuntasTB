import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { nurses } from "@/lib/db/schema";
import { config } from "@/lib/config";
import { verifyPassword, verifyAgainstDummy } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { loginThrottle } from "@/lib/auth/throttle";
import { audit } from "@/lib/audit/audit";
import { copy } from "@/copy/nurse.id";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: copy.login.invalidCredentials },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;

  // Throttle: 5 failures per 15 minutes, even if the password is correct.
  if (loginThrottle.isBlocked(email)) {
    return NextResponse.json({ error: copy.login.tooMany }, { status: 429 });
  }

  const nurse = await db.query.nurses.findFirst({
    where: eq(nurses.email, email),
  });

  let ok = false;
  if (nurse) {
    ok = await verifyPassword(password, nurse.passwordHash, config.HASH_PEPPER);
  } else {
    // Compare against a dummy hash so timing does not reveal existence.
    await verifyAgainstDummy(password, config.HASH_PEPPER);
  }

  if (!ok || !nurse) {
    loginThrottle.recordFailure(email);
    await audit(db, {
      actor: "system",
      action: "auth.login_failed",
      target: null,
      meta: { emailAttempted: email },
    });
    return NextResponse.json(
      { error: copy.login.invalidCredentials },
      { status: 401 },
    );
  }

  loginThrottle.reset(email);

  const token = await createSession(
    { nurseId: nurse.id, puskesmasId: nurse.puskesmasId },
    config.SESSION_SECRET,
  );

  await audit(db, {
    actor: `nurse:${nurse.id}`,
    action: "auth.login",
    target: `nurse:${nurse.id}`,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.APP_BASE_URL.startsWith("https"),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

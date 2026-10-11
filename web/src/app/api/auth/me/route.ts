import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { requireNurse, UnauthorizedError } from "@/lib/auth/requireNurse";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { nurseId, puskesmasId } = await requireNurse(
      request,
      config.SESSION_SECRET,
    );
    return NextResponse.json({ nurseId, puskesmasId });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw e;
  }
}

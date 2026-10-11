import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { todayJakarta } from "@/lib/time";
import { fieldErrors, registrationSchema } from "@/lib/patients/schema";
import {
  createPatient,
  DuplicateCodeError,
  familyLinkUrl,
  listPatients,
} from "@/lib/patients/service";
import { authNurse, json, readJson } from "@/lib/patients/http";
import { copy } from "@/copy/nurse.id";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const patients = await listPatients(db, auth.session);
  return json({ patients });
}

export async function POST(request: Request) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;

  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "validation", fields: { _form: copy.patients.validation.unknownField } }, 400);
  }
  const parsed = registrationSchema(todayJakarta()).safeParse(body);
  if (!parsed.success) {
    return json({ error: "validation", fields: fieldErrors(parsed.error) }, 400);
  }

  try {
    const { patient, token } = await createPatient(
      db,
      auth.session,
      parsed.data,
      config.HASH_PEPPER,
    );
    return json({ patient, familyLink: familyLinkUrl(config.APP_BASE_URL, token) }, 201);
  } catch (e) {
    if (e instanceof DuplicateCodeError) {
      return json(
        { error: "duplicate_code", fields: { code: copy.patients.validation.codeTaken } },
        409,
      );
    }
    throw e;
  }
}

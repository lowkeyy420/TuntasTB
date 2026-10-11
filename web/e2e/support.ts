import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type APIRequestContext } from "@playwright/test";
import postgres from "postgres";

/** The running stack the tests drive. */
export const STACK = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://tuntas:tuntas@localhost:5433/tuntas";

const jakartaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

function daysAgo(n: number): string {
  const d = new Date(`${jakartaToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export interface TestPatient {
  id: string;
  code: string;
  token: string;
}

/** Logs in as the demo nurse and registers a patient (treatment day 18) with consent recorded. */
export async function createPatient(request: APIRequestContext, consent = true): Promise<TestPatient> {
  const login = await request.post(`${STACK}/api/auth/login`, {
    data: { email: "perawat@demo.id", password: "demo12345" },
  });
  expect(login.ok()).toBeTruthy();
  const code = `PW-${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
  const created = await request.post(`${STACK}/api/nurse/patients`, {
    data: { code, startDate: daysAgo(17), phase: "intensive", pickupIntervalDays: 14, pmoPhone: "081234567890" },
  });
  expect(created.status()).toBe(201);
  const body = await created.json();
  const token = (body.familyLink as string).split("/f/")[1];
  if (consent) {
    const res = await request.post(`${STACK}/api/family/consent`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.ok()).toBeTruthy();
  }
  return { id: body.patient.id, code, token };
}

export async function deletePatient(request: APIRequestContext, patient: TestPatient): Promise<void> {
  await request.delete(`${STACK}/api/nurse/patients/${patient.id}`);
}

/** Rows stored for the patient, read straight from the database. */
export async function storedFor(patientId: string) {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const checkins = await sql`select client_id, triage_level, text_redacted from checkins where patient_id = ${patientId}`;
    const alerts = await sql`select id from alerts where patient_id = ${patientId}`;
    return { checkins, alerts };
  } finally {
    await sql.end();
  }
}

/**
 * A reverse proxy in front of the stack that can be cut, so that "no signal"
 * affects the page AND its service worker (the browser's own offline switch
 * does not reach service-worker requests).
 */
export async function startProxy() {
  let cut = false;
  const target = new URL(STACK);
  const server = http.createServer((req, res) => {
    if (cut) {
      req.socket.destroy();
      return;
    }
    const upstream = http.request(
      { host: target.hostname, port: target.port, path: req.url, method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    setCut(value: boolean) {
      cut = value;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

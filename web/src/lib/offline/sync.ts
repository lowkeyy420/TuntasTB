import type { CheckinReply } from "@/lib/checkin/reply";
import type { CheckinBodyInput, DoseStatus } from "@/lib/checkin/schema";
import { todayJakarta } from "@/lib/time";
import type { Rules } from "@/lib/triage/types";
import { addEntry, listQueued, markSent, removeEntry, type OutboxEntry } from "./outbox";
import { provisionalReply, type DisplayReply } from "./provisional";

/**
 * Sending check-ins with a safety net: `submit` always writes to the outbox
 * first and only then tries the network; `flush` sends whatever is still
 * queued. The server stores each `(patient, clientId)` once, so a retry after
 * a lost response is harmless.
 */

export type SubmitOutcome =
  | { kind: "sent"; clientId: string; reply: CheckinReply }
  | { kind: "queued"; clientId: string; provisional: DisplayReply }
  /** The server refused it for good (too many today, link no longer valid); it is not retried. */
  | { kind: "rejected"; clientId: string; reason: "too_many" | "invalid" }
  /** Not sent and the device could not keep it either. */
  | { kind: "failed" };

export interface SyncEnv {
  fetchFn?: typeof fetch;
  now?: () => number;
}

type PostResult =
  | { kind: "ok"; reply: CheckinReply }
  | { kind: "rejected"; reason: "too_many" | "invalid" }
  | { kind: "retry" };

const listeners = new Set<() => void>();

/** Calls `fn` whenever the outbox changed; returns the unsubscribe function. */
export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const emit = () => listeners.forEach((fn) => fn());

/** A random UUID even on pages without `crypto.randomUUID` (plain http on a LAN). */
export function newClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function post(token: string, payload: CheckinBodyInput, env: SyncEnv): Promise<PostResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "retry" };
  try {
    const res = await (env.fetchFn ?? fetch)("/api/checkins", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (res.ok) return { kind: "ok", reply: (await res.json()) as CheckinReply };
    if (res.status === 429) return { kind: "rejected", reason: "too_many" };
    if (res.status >= 400 && res.status < 500 && res.status !== 408) {
      return { kind: "rejected", reason: "invalid" };
    }
    return { kind: "retry" };
  } catch {
    // Network down, response lost, or an unreadable body: keep it and retry later.
    return { kind: "retry" };
  }
}

export interface SubmitArgs {
  token: string;
  doseStatus: DoseStatus;
  chips: string[];
  text: string;
  rules: Rules;
  contact: { name: string; phone: string };
}

/** Outbox first, then network. Never loses the check-in while the device can store it. */
export async function submit(args: SubmitArgs, env: SyncEnv = {}): Promise<SubmitOutcome> {
  const now = env.now ?? Date.now;
  const clientId = newClientId();
  const occurredOn = todayJakarta(new Date(now()));
  const payload: CheckinBodyInput = {
    clientId,
    occurredOn,
    doseStatus: args.doseStatus,
    chips: args.chips,
    text: args.text,
  };
  const provisional = provisionalReply(
    { doseStatus: args.doseStatus, chips: args.chips, text: args.text },
    args.rules,
    args.contact,
  );

  let stored = true;
  try {
    await addEntry({
      clientId,
      token: args.token,
      occurredOn,
      payload,
      status: "queued",
      createdAt: now(),
      provisional,
      reply: null,
      sentAt: null,
    });
  } catch {
    stored = false;
  }

  const result = await post(args.token, payload, env);
  if (result.kind === "ok") {
    if (stored) await markSent(clientId, result.reply, now()).catch(() => undefined);
    emit();
    return { kind: "sent", clientId, reply: result.reply };
  }
  if (result.kind === "rejected") {
    if (stored) await removeEntry(clientId).catch(() => undefined);
    emit();
    return { kind: "rejected", clientId, reason: result.reason };
  }
  if (!stored) return { kind: "failed" };
  emit();
  return { kind: "queued", clientId, provisional };
}

export interface FlushResult {
  sent: number;
  remaining: number;
}

let inFlight: Promise<FlushResult> | null = null;

async function flushOnce(env: SyncEnv): Promise<FlushResult> {
  const now = env.now ?? Date.now;
  let queued: OutboxEntry[];
  try {
    queued = await listQueued();
  } catch {
    return { sent: 0, remaining: 0 };
  }

  let sent = 0;
  for (let i = 0; i < queued.length; i++) {
    const entry = queued[i];
    if (!entry.token || !entry.payload) {
      await removeEntry(entry.clientId);
      continue;
    }
    const result = await post(entry.token, entry.payload, env);
    if (result.kind === "ok") {
      await markSent(entry.clientId, result.reply, now());
      sent++;
    } else if (result.kind === "rejected") {
      await removeEntry(entry.clientId);
    } else {
      // Still no connection: stop here, the rest stays queued in order.
      emit();
      return { sent, remaining: queued.length - i };
    }
  }
  emit();
  return { sent, remaining: 0 };
}

/**
 * Sends queued check-ins, oldest first, each with the token it was made under.
 * Safe to call from several triggers at once: overlapping calls share one run.
 */
export function flush(env: SyncEnv = {}): Promise<FlushResult> {
  inFlight ??= flushOnce(env).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

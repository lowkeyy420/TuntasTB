import type { CheckinReply } from "@/lib/checkin/reply";
import type { CheckinBodyInput } from "@/lib/checkin/schema";
import { run } from "./idb";
import type { DisplayReply } from "./provisional";

/**
 * Check-ins on this device that the server may not have yet.
 *
 * An entry is written BEFORE the network is tried, so a check-in survives a
 * lost connection, a closed tab or a restart. The note is stored as typed on
 * the user's own device; once the server confirms, the text and the link
 * token are removed from the entry and only the reply is kept (for the
 * "Terkirim" status). Sent entries are pruned after a while.
 */
export interface OutboxEntry {
  clientId: string;
  /** Link token of the patient this check-in belongs to. Removed once sent. */
  token: string | null;
  occurredOn: string;
  /** The request body. Removed once sent. */
  payload: CheckinBodyInput | null;
  status: "queued" | "sent";
  createdAt: number;
  /** What the family was shown while it was unsent. */
  provisional: DisplayReply;
  /** The server's reply, once sent. */
  reply: CheckinReply | null;
  sentAt: number | null;
}

const KEEP_SENT = 20;

export const addEntry = (entry: OutboxEntry) =>
  run("outbox", "readwrite", (s) => s.put(entry)).then(() => undefined);

export const getEntry = (clientId: string) =>
  run<OutboxEntry | undefined>("outbox", "readonly", (s) => s.get(clientId));

export const removeEntry = (clientId: string) =>
  run("outbox", "readwrite", (s) => s.delete(clientId)).then(() => undefined);

async function all(): Promise<OutboxEntry[]> {
  return run<OutboxEntry[]>("outbox", "readonly", (s) => s.getAll());
}

/** Unsent entries, oldest first. */
export async function listQueued(): Promise<OutboxEntry[]> {
  return (await all()).filter((e) => e.status === "queued").sort((a, b) => a.createdAt - b.createdAt);
}

export async function countQueued(): Promise<number> {
  return (await listQueued()).length;
}

/** Marks an entry sent, keeps only the server's reply, and prunes old sent entries. */
export async function markSent(clientId: string, reply: CheckinReply, now: number): Promise<void> {
  const entry = await getEntry(clientId);
  if (!entry) return;
  await addEntry({ ...entry, status: "sent", token: null, payload: null, reply, sentAt: now });
  const sent = (await all()).filter((e) => e.status === "sent").sort((a, b) => b.createdAt - a.createdAt);
  for (const old of sent.slice(KEEP_SENT)) await removeEntry(old.clientId);
}

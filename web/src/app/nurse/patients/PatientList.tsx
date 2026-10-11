"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/copy/nurse.id";
import { LinkModal } from "./LinkModal";

interface PatientRow {
  id: string;
  code: string;
  treatmentDay: number;
  phase: string;
  hasPmo: boolean;
  consented: boolean;
  linkStatus: "active" | "revoked" | "none";
}

const t = copy.patients;

function Badge({ tone, children }: { tone: "ok" | "warn" | "off"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-teal-100 text-teal-900"
      : tone === "warn"
        ? "bg-amber-100 text-amber-900"
        : "bg-black/10 text-black/70";
  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${cls}`}>{children}</span>;
}

export function PatientList() {
  const router = useRouter();
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/nurse/patients", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error("load");
      const body = await res.json();
      setRows(body.patients);
      setError(null);
    } catch {
      setError(t.loadFailed);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotate(id: string) {
    if (!window.confirm(t.actions.confirmRotate)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/nurse/patients/${id}/token`, { method: "POST" });
      if (!res.ok) throw new Error("rotate");
      const body = await res.json();
      setLink(body.familyLink);
      setError(null);
      await load();
    } catch {
      setError(t.actionFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm(t.actions.confirmRevoke)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/nurse/patients/${id}/token`, { method: "DELETE" });
      if (!res.ok) throw new Error("revoke");
      setError(null);
      await load();
    } catch {
      setError(t.actionFailed);
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null && !error) return <p className="text-lg">{t.loading}</p>;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-base text-red-700">
          {error}
        </p>
      )}
      {rows && rows.length === 0 && <p className="text-lg">{t.empty}</p>}
      <ul className="space-y-3">
        {rows?.map((p) => (
          <li key={p.id} className="space-y-3 rounded-lg border border-black/15 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xl font-semibold">{p.code}</span>
              <span className="text-base text-black/70">
                {t.columns.day} {p.treatmentDay}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="off">{p.phase === "intensive" ? t.phase.intensive : t.phase.continuation}</Badge>
              <Badge tone="off">{p.hasPmo ? t.status.pmoYes : t.status.pmoNo}</Badge>
              <Badge tone={p.consented ? "ok" : "warn"}>
                {p.consented ? t.status.consentGiven : t.status.consentPending}
              </Badge>
              <Badge tone={p.linkStatus === "active" ? "ok" : "warn"}>
                {t.columns.link}:{" "}
                {p.linkStatus === "active"
                  ? t.status.linkActive
                  : p.linkStatus === "revoked"
                    ? t.status.linkRevoked
                    : t.status.linkNone}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => rotate(p.id)}
                className="min-h-12 flex-1 rounded border border-teal-700 px-4 text-lg text-teal-800 disabled:opacity-50"
              >
                {t.actions.rotate}
              </button>
              <button
                type="button"
                disabled={busyId === p.id || p.linkStatus !== "active"}
                onClick={() => revoke(p.id)}
                className="min-h-12 flex-1 rounded border border-red-700 px-4 text-lg text-red-800 disabled:opacity-40"
              >
                {t.actions.revoke}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {link && <LinkModal link={link} onClose={() => setLink(null)} />}
    </div>
  );
}

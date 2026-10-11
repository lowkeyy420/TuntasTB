"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Link2,
  LoaderCircle,
  RefreshCw,
  Unlink,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, Button, ButtonLink, Card, EmptyState, StatusPill } from "@/components/ui";
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

  if (rows === null && !error) {
    return (
      <p role="status" className="flex items-center gap-3 text-lg font-semibold text-ink">
        <LoaderCircle aria-hidden className="size-7 shrink-0 animate-spin text-primary" />
        {t.loading}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert tone="danger" role="alert">
          <p>{error}</p>
          {rows === null && (
            <Button variant="secondary" size="md" icon={RefreshCw} className="mt-3" onClick={() => void load()}>
              {t.retry}
            </Button>
          )}
        </Alert>
      )}
      {rows && rows.length === 0 && (
        <EmptyState
          icon={Users}
          title={t.empty}
          action={
            <ButtonLink block icon={UserPlus} href="/nurse/patients/new">
              {copy.console.newPatientLink}
            </ButtonLink>
          }
        >
          {t.emptyBody}
        </EmptyState>
      )}
      <ul className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {rows?.map((p) => (
          <Card as="li" key={p.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-2xl font-bold tabular-nums text-ink">{p.code}</span>
              <span className="text-base font-semibold text-ink-muted">
                {t.columns.day} {p.treatmentDay}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone="off" icon={Activity}>
                {p.phase === "intensive" ? t.phase.intensive : t.phase.continuation}
              </StatusPill>
              <StatusPill tone="off" icon={p.hasPmo ? UserCheck : UserX}>
                {p.hasPmo ? t.status.pmoYes : t.status.pmoNo}
              </StatusPill>
              <StatusPill tone={p.consented ? "ok" : "warn"}>
                {p.consented ? t.status.consentGiven : t.status.consentPending}
              </StatusPill>
              <StatusPill
                tone={p.linkStatus === "active" ? "ok" : p.linkStatus === "revoked" ? "danger" : "warn"}
                icon={p.linkStatus === "active" ? Link2 : undefined}
              >
                {t.columns.link}:{" "}
                {p.linkStatus === "active"
                  ? t.status.linkActive
                  : p.linkStatus === "revoked"
                    ? t.status.linkRevoked
                    : t.status.linkNone}
              </StatusPill>
            </div>
            <div className="mt-auto flex flex-col gap-3 sm:flex-row">
              <Button
                block
                size="md"
                variant="secondary"
                icon={RefreshCw}
                disabled={busyId === p.id}
                onClick={() => rotate(p.id)}
              >
                {t.actions.rotate}
              </Button>
              <Button
                block
                size="md"
                variant="danger"
                icon={Unlink}
                disabled={busyId === p.id || p.linkStatus !== "active"}
                onClick={() => revoke(p.id)}
              >
                {t.actions.revoke}
              </Button>
            </div>
          </Card>
        ))}
      </ul>
      {link && <LinkModal link={link} onClose={() => setLink(null)} />}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { copy } from "@/copy/family.id";
import { PickupCard } from "@/components/pickup/PickupCard";
import { loadPickup, savePickup } from "@/lib/offline/cache";
import { daysUntil, pickupState, type PickupState } from "@/lib/pickups/dates";
import { telHref } from "./CheckinScreen";

interface PickupData {
  dueDate: string;
  daysUntil: number;
  state: PickupState;
}

/** Countdown and state worked out from the due date against a calendar day (Jakarta). */
function derive(dueDate: string, today: string): PickupData {
  return { dueDate, daysUntil: daysUntil(dueDate, today), state: pickupState(dueDate, false, today) };
}

/**
 * The next pickup on the family home: a calendar sheet with a countdown, a
 * nudge from two days before and an overdue notice with the Puskesmas number.
 * Online, the server's values are shown and the due date is kept on the device;
 * offline, the kept due date is counted again against the device's date.
 * Shows nothing while loading or when no pickup is scheduled.
 */
export function FamilyPickup({
  token,
  puskesmasName,
  puskesmasPhone,
  today,
}: {
  token: string;
  puskesmasName: string;
  puskesmasPhone: string;
  /** The device's calendar day in Jakarta, `YYYY-MM-DD`. */
  today: string;
}) {
  const [data, setData] = useState<PickupData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const show = (next: PickupData | null) => {
      if (!cancelled) setData(next);
    };
    void (async () => {
      try {
        const res = await fetch("/api/family/pickup", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) throw new Error("pickup");
        const body = (await res.json()) as {
          pickup: { dueDate: string; daysUntil: number; state: PickupState } | null;
        };
        void savePickup(token, body.pickup?.dueDate ?? null).catch(() => undefined);
        show(body.pickup ? { dueDate: body.pickup.dueDate, daysUntil: body.pickup.daysUntil, state: body.pickup.state } : null);
      } catch {
        const cached = await loadPickup(token).catch(() => null);
        show(cached?.dueDate ? derive(cached.dueDate, today) : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, today]);

  if (!data || data.state === "done") return null;
  return (
    <section aria-labelledby="pickup-heading" className="flex flex-col gap-3">
      <h2 id="pickup-heading" className="text-lg font-semibold text-ink">
        {copy.pickup.title}
      </h2>
      <PickupCard
        dueDate={data.dueDate}
        daysUntil={data.daysUntil}
        state={data.state}
        contactLine={copy.contact(puskesmasName, puskesmasPhone)}
        puskesmasName={puskesmasName}
        phoneHref={telHref(puskesmasPhone)}
      />
    </section>
  );
}

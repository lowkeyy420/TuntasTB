"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { copy } from "@/copy/family.id";
import { copy as design } from "@/copy/design.id";
import { BottomActionBar, Button, Select } from "@/components/ui";
import { PickupCard } from "@/components/pickup/PickupCard";
import type { PickupState } from "@/lib/pickups/dates";
import { mockPickup, mockPuskesmas, mockToday } from "./data";
import { dayDiff } from "@/lib/risk/dates";

type Key = keyof typeof mockPickup;

const stateOf: Record<Key, PickupState> = { five: "upcoming", tomorrow: "nudge", today: "due_today", overdue: "missed" };

/** Pickup countdown mockup: the real card, with a preview control to pick the state. */
export function PickupMock() {
  const s = design.mockups.pickupState;
  const [key, setKey] = useState<Key>("five");
  const dueDate = mockPickup[key];
  const contact = copy.contact(mockPuskesmas.name, mockPuskesmas.phone);

  return (
    <main className="flex flex-1 flex-col gap-5 pt-4">
      {/* Preview control, not part of the screen. */}
      <div className="rounded-control border-2 border-dashed border-line-strong p-3">
        <Select label={s.label} value={key} onChange={(e) => setKey(e.target.value as Key)}>
          <option value="five">{s.five}</option>
          <option value="tomorrow">{s.tomorrow}</option>
          <option value="today">{s.today}</option>
          <option value="overdue">{s.overdue}</option>
        </Select>
      </div>

      <h1 className="text-2xl font-bold text-ink">{copy.pickup.title}</h1>

      <PickupCard
        dueDate={dueDate}
        daysUntil={dayDiff(mockToday, dueDate)}
        state={stateOf[key]}
        contactLine={contact}
        puskesmasName={mockPuskesmas.name}
      />

      <BottomActionBar>
        <Button block icon={Phone} variant={key === "overdue" ? "primary" : "secondary"}>
          {copy.call}
        </Button>
      </BottomActionBar>
    </main>
  );
}

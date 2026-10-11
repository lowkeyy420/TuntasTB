"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { copy } from "@/copy/family.id";
import { copy as design } from "@/copy/design.id";
import {
  Alert,
  BottomActionBar,
  Button,
  Card,
  DateTile,
  Select,
  formatLongDate,
} from "@/components/ui";
import { mockPickup, mockPuskesmas } from "./data";

type State = keyof typeof mockPickup;

/** Pickup countdown: the due day as a calendar sheet, with a nudge from two days before. */
export function PickupMock() {
  const t = copy.pickup;
  const s = design.mockups.pickupState;
  const [state, setState] = useState<State>("five");
  const due = mockPickup[state];
  const contact = copy.contact(mockPuskesmas.name, mockPuskesmas.phone);

  const headline =
    state === "five" ? t.inDays(5) : state === "tomorrow" ? t.tomorrow : state === "today" ? t.today : t.overdue;

  return (
    <main className="flex flex-1 flex-col gap-5 pt-4">
      {/* Preview control, not part of the screen. */}
      <div className="rounded-control border-2 border-dashed border-line-strong p-3">
        <Select label={s.label} value={state} onChange={(e) => setState(e.target.value as State)}>
          <option value="five">{s.five}</option>
          <option value="tomorrow">{s.tomorrow}</option>
          <option value="today">{s.today}</option>
          <option value="overdue">{s.overdue}</option>
        </Select>
      </div>

      <h1 className="text-2xl font-bold text-ink">{t.title}</h1>

      {state === "tomorrow" && (
        <Alert tone="warning" title={t.nudgeTitle}>
          {t.nudgeBody}
        </Alert>
      )}
      {state === "today" && (
        <Alert tone="warning" title={t.today}>
          {t.todayBody}
        </Alert>
      )}
      {state === "overdue" && (
        <Alert tone="danger" title={t.overdue}>
          <p>{t.overdueBody}</p>
          <p className="font-bold">{contact}</p>
        </Alert>
      )}

      <Card className="flex items-center gap-4">
        <DateTile date={due} />
        <div className="min-w-0">
          <p className="text-xl font-bold text-ink">{headline}</p>
          <p className="text-base text-ink">{t.dueOn(formatLongDate(due))}</p>
          <p className="text-base text-ink">{t.place(mockPuskesmas.name)}</p>
        </div>
      </Card>

      {state !== "overdue" && <p className="pb-6 text-lg font-bold text-ink">{contact}</p>}

      <BottomActionBar>
        <Button block icon={Phone} variant={state === "overdue" ? "primary" : "secondary"}>
          {copy.call}
        </Button>
      </BottomActionBar>
    </main>
  );
}

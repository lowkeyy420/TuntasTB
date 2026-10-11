"use client";

import { useState } from "react";
import { AlertInbox, type AlertView } from "@/components/alerts/AlertInbox";
import { mockAckTime, mockAlerts } from "./data";

/**
 * RED alert inbox mockup: the real inbox component with made-up alerts. The
 * acknowledgement is pretended in this component's state; the real page sends
 * it to the server.
 */
export function AlertInboxMock() {
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());
  const alerts: AlertView[] = mockAlerts.map((a) => ({
    id: a.id,
    code: a.code,
    day: a.day,
    flags: a.flags,
    time: a.time,
    acknowledged: acked.has(a.id),
    acknowledgedBy: "Anda",
    acknowledgedTime: mockAckTime,
  }));

  return (
    <main>
      <AlertInbox alerts={alerts} onAcknowledge={(id) => setAcked(new Set(acked).add(id))} />
    </main>
  );
}

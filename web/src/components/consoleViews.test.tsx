// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { copy } from "@/copy/nurse.id";
import { copy as family } from "@/copy/family.id";
import type { QueueItem } from "@/lib/queue/types";
import { AlertInbox, type AlertView } from "./alerts/AlertInbox";
import { PickupCard } from "./pickup/PickupCard";
import { QueueList } from "./queue/QueueList";

afterEach(cleanup);

const entry = (over: Partial<QueueItem> = {}): QueueItem => ({
  patientId: "p1",
  code: "KODE-1",
  day: 41,
  score: 8,
  band: "high",
  level: "YELLOW",
  overridden: false,
  reason: "mual 7 hari + bilang sudah sembuh atau mau berhenti",
  action: "call",
  lastCheckin: "kemarin 19.20",
  factors: [{ text: "Keluhan yang sama sudah 7 hari", points: 3 }],
  ...over,
});

describe("QueueList", () => {
  it("links the code to the history and the action to its target", () => {
    const { container } = render(
      <QueueList
        entries={[entry(), entry({ patientId: "p2", code: "KODE-2", action: "earlyPickup", level: null, overridden: true })]}
        today="2026-03-20"
        historyHref={(e) => `/nurse/patients/${e.patientId}`}
        actionHref={(e) => (e.action === "earlyPickup" ? `/nurse/patients?fokus=${e.patientId}` : `/nurse/patients/${e.patientId}`)}
      />,
    );
    const items = Array.from(container.querySelectorAll<HTMLElement>("ol > li"));
    const first = items[0];
    expect(within(first).getByRole("link", { name: /KODE-1/ }).getAttribute("href")).toBe("/nurse/patients/p1");
    expect(within(first).getByRole("link", { name: copy.queue.actions.call }).getAttribute("href")).toBe("/nurse/patients/p1");
    const second = items[1];
    expect(within(second).getByRole("link", { name: copy.queue.actions.earlyPickup }).getAttribute("href")).toBe(
      "/nurse/patients?fokus=p2",
    );
    // No level yet (never reported): no badge; a nurse override is marked in words.
    expect(second.querySelector("[data-level]")).toBeNull();
    expect(second.textContent).toContain(copy.queue.overridden);
    expect(first.textContent).toContain(copy.triageShort.YELLOW);
  });

  it("shows rank, day, score with band, reason, last report and the points behind the score", () => {
    const { container } = render(<QueueList entries={[entry()]} today="2026-03-20" />);
    const li = container.querySelector("ol > li")!;
    expect(li.textContent).toContain("1");
    for (const text of [
      copy.queue.day(41),
      `${copy.queue.score(8)} · ${copy.queue.band.high}`,
      "mual 7 hari + bilang sudah sembuh",
      copy.queue.lastCheckin("kemarin 19.20"),
      "Keluhan yang sama sudah 7 hari",
      copy.queue.points(3),
    ]) {
      expect(li.textContent).toContain(text);
    }
    expect(screen.getByText(copy.queue.count(1))).toBeTruthy();
  });

  it("no suggested action for a score of 0, and no details when there are no factors", () => {
    const { container } = render(
      <QueueList entries={[entry({ score: 0, band: "low", action: "none", factors: [], level: "GREEN" })]} today="2026-03-20" />,
    );
    expect(screen.getByText(copy.queue.actions.none).tagName).toBe("P");
    expect(container.querySelector("details")).toBeNull();
  });
});

const view = (over: Partial<AlertView> = {}): AlertView => ({
  id: "a1",
  patientId: "p1",
  code: "KODE-1",
  day: 9,
  flags: ["Mata atau kulit kuning"],
  time: "07.42",
  acknowledged: false,
  ...over,
});

describe("AlertInbox", () => {
  it("lists open alerts first, the first with the primary button, then the log with who and when", () => {
    const onAck = vi.fn();
    render(
      <AlertInbox
        alerts={[
          view({ id: "done", code: "KODE-0", acknowledged: true, acknowledgedBy: "perawat@demo.id", acknowledgedTime: "07.50" }),
          view({ id: "a1" }),
          view({ id: "a2", code: "KODE-2" }),
        ]}
        onAcknowledge={onAck}
        historyHref={(a) => `/nurse/patients/${a.patientId}`}
        connection={copy.alerts.connection.live}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(copy.alerts.open(2));
    expect(screen.getByText(copy.alerts.connection.live)).toBeTruthy();
    const cards = screen.getAllByRole("listitem");
    expect(cards.map((c) => /KODE-\d/.exec(c.textContent!)![0])).toEqual(["KODE-1", "KODE-2", "KODE-0"]);

    const buttons = screen.getAllByRole("button", { name: copy.alerts.acknowledge });
    expect(buttons).toHaveLength(2);
    expect(buttons[0].classList.contains("bg-primary")).toBe(true);
    expect(buttons[1].classList.contains("bg-primary")).toBe(false);
    fireEvent.click(buttons[0]);
    expect(onAck).toHaveBeenCalledWith("a1");

    expect(cards[2].textContent).toContain(copy.alerts.acknowledgedBy("perawat@demo.id", "07.50"));
    expect(screen.getAllByRole("link")[0].getAttribute("href")).toBe("/nurse/patients/p1");
  });

  it("shows progress on the button being saved, an error, and the all-clear state", () => {
    const { rerender } = render(
      <AlertInbox alerts={[view()]} onAcknowledge={() => undefined} busyId="a1" error={copy.alerts.ackFailed} />,
    );
    const button = screen.getByRole("button", { name: copy.alerts.acknowledging }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(copy.alerts.ackFailed);

    rerender(<AlertInbox alerts={[view({ acknowledged: true, acknowledgedBy: "x@y.id", acknowledgedTime: "08.00" })]} onAcknowledge={() => undefined} />);
    expect(screen.getByRole("status").textContent).toContain(copy.alerts.allClear);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not show the family contact or any phone number", () => {
    const { container } = render(<AlertInbox alerts={[view()]} onAcknowledge={() => undefined} />);
    expect(container.textContent).not.toMatch(/08\d{8,}|021-/);
    expect(container.textContent).toContain(copy.alerts.receivedAt("07.42"));
    expect(container.textContent).toContain("Mata atau kulit kuning");
  });
});

describe("PickupCard (pickup-planner 4.3)", () => {
  const contact = family.contact("Contoh", "021-555-0100");
  const props = { contactLine: contact, puskesmasName: "Contoh" };

  it("upcoming (5 days): the countdown and the due date, no banner", () => {
    render(<PickupCard {...props} dueDate="2026-03-25" daysUntil={5} state="upcoming" />);
    expect(screen.getByText("Ambil obat 5 hari lagi")).toBeTruthy();
    expect(screen.getByText(/Jadwal: Rabu, 25 Maret 2026/)).toBeTruthy();
    expect(screen.queryByText(family.pickup.nudgeTitle)).toBeNull();
    expect(screen.getByText(contact)).toBeTruthy();
  });

  it("nudge at 2 days: banner and the countdown", () => {
    render(<PickupCard {...props} dueDate="2026-03-22" daysUntil={2} state="nudge" />);
    expect(screen.getByText(family.pickup.nudgeTitle)).toBeTruthy();
    expect(screen.getByText(family.pickup.nudgeBody)).toBeTruthy();
    expect(screen.getByText("Ambil obat 2 hari lagi")).toBeTruthy();
  });

  it("nudge at 1 day says the pickup is tomorrow", () => {
    render(<PickupCard {...props} dueDate="2026-03-21" daysUntil={1} state="nudge" />);
    expect(screen.getByText(family.pickup.nudgeTitle)).toBeTruthy();
    expect(screen.getByText(family.pickup.tomorrow)).toBeTruthy();
  });

  it("due today: 'Ambil obat hari ini' with its banner", () => {
    render(<PickupCard {...props} dueDate="2026-03-20" daysUntil={0} state="due_today" />);
    expect(screen.getAllByText(family.pickup.today).length).toBeGreaterThan(0);
    expect(screen.getByText(family.pickup.todayBody)).toBeTruthy();
  });

  it("missed: the overdue banner with days overdue, the Puskesmas number and a call link; no dosing words", () => {
    const { container } = render(
      <PickupCard {...props} dueDate="2026-03-17" daysUntil={-3} state="missed" phoneHref="tel:0215550100" />,
    );
    expect(screen.getAllByText(family.pickup.overdue).length).toBeGreaterThan(0);
    expect(screen.getByText(family.pickup.overdueDays(3))).toBeTruthy();
    expect(screen.getByText(contact)).toBeTruthy();
    expect(screen.getByRole("link", { name: family.call }).getAttribute("href")).toBe("tel:0215550100");
    expect(container.textContent).not.toMatch(/\b(dosis|tablet|kapsul|pil|mg|aman)\b/i);
    expect(container.textContent).not.toMatch(/\b(TB|TBC|tuberkulosis)\b/i);
  });
});

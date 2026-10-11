// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { copy as family } from "@/copy/family.id";
import { copy as nurse } from "@/copy/nurse.id";
import { metadata as designMeta } from "../page";
import { metadata as screenMeta, generateStaticParams } from "../screens/[screen]/page";
import { screens } from "../screens";
import { AlertInboxMock } from "./AlertInboxMock";
import { AskMock } from "./AskMock";
import { CheckinMock } from "./CheckinMock";
import { PickupMock } from "./PickupMock";
import { QueueMock } from "./QueueMock";
import { ReplyView } from "./ReplyView";
import { mockAlerts, mockPuskesmas, mockQueue } from "./data";

const FORBIDDEN = /\b(TB|TBC|tuberkulosis|TuntasTB)\b/i;
const contact = family.contact(mockPuskesmas.name, mockPuskesmas.phone);

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled(); // a mockup never touches the network
  vi.unstubAllGlobals();
});

const primaryButtons = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("button, a")).filter((el) => el.classList.contains("bg-primary"));

describe("design preview page", () => {
  it("is titled 'Pratinjau Desain' and kept out of search indexes", () => {
    expect(designMeta.title).toBe("Pratinjau Desain");
    expect(designMeta.robots).toEqual({ index: false, follow: false });
    expect(screenMeta.robots).toEqual({ index: false, follow: false });
  });

  it("offers every screen that is not built yet", () => {
    expect(generateStaticParams().map((p) => p.screen)).toEqual([
      "checkin",
      "reply-green",
      "reply-yellow",
      "reply-red",
      "pickup",
      "ask",
      "queue",
      "alerts",
    ]);
  });

  it("family mockups stay neutral and show at most one primary action", () => {
    for (const s of screens.filter((x) => x.area === "family")) {
      const { container, unmount } = render(<>{s.render()}</>);
      expect(container.textContent, s.slug).not.toMatch(FORBIDDEN);
      expect(container.textContent, s.slug).not.toMatch(/\baman\b/i);
      expect(primaryButtons(container).length, s.slug).toBeLessThanOrEqual(1);
      expect(container.querySelector('a[href^="/design"], a[href^="/nurse"]'), s.slug).toBeNull();
      unmount();
    }
  });

  it("nurse mockups show at most one primary action", () => {
    for (const s of screens.filter((x) => x.area === "nurse")) {
      const { container, unmount } = render(<>{s.render()}</>);
      expect(primaryButtons(container).length, s.slug).toBeLessThanOrEqual(1);
      unmount();
    }
  });
});

describe("check-in mockup", () => {
  it("shows the dose question, three answers, labelled chips and a note with a microphone", () => {
    render(<CheckinMock />);
    expect(screen.getByRole("group", { name: "Obat hari ini sudah diminum?" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual([
      "Sudah",
      "Belum",
      "Sebagian",
    ]);
    const chips = screen.getAllByRole("checkbox");
    expect(chips.length).toBe(Object.keys(family.checkin.symptoms).length);
    for (const chip of chips) {
      const label = chip.closest("label")!;
      expect(label.textContent).not.toBe("");
      expect(label.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByLabelText(family.checkin.noteLabel)).toBeTruthy();
    expect(screen.getByRole("button", { name: family.checkin.mic })).toBeTruthy();
  });

  it("keeps Kirim disabled until a dose answer is chosen, and says why", () => {
    render(<CheckinMock />);
    const send = screen.getByRole("button", { name: family.checkin.send }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByText(family.checkin.sendBlocked)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Sudah" }));
    expect(send.disabled).toBe(false);
    expect(screen.queryByText(family.checkin.sendBlocked)).toBeNull();
  });

  it("submits a dose-only check-in in two taps and shows the reply", () => {
    render(<CheckinMock />);
    fireEvent.click(screen.getByRole("radio", { name: "Sudah" }));
    fireEvent.click(screen.getByRole("button", { name: family.checkin.send }));
    expect(screen.getByText(family.triage.GREEN.label)).toBeTruthy();
    expect(screen.getByText(family.reply.GREEN.action)).toBeTruthy();
  });

  it("submits a dose and one symptom in three taps", () => {
    render(<CheckinMock />);
    fireEvent.click(screen.getByRole("radio", { name: "Sudah" }));
    fireEvent.click(screen.getByRole("checkbox", { name: family.checkin.symptoms.yellow }));
    fireEvent.click(screen.getByRole("button", { name: family.checkin.send }));
    expect(screen.getByText(family.triage.RED.label)).toBeTruthy();
  });

  it("the microphone puts editable text in the note and counts what is left", () => {
    render(<CheckinMock />);
    expect(screen.getByText(family.checkin.noteRemaining(500))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: family.checkin.mic }));
    expect(screen.getByRole("status").textContent).toContain(family.checkin.micListening);
    fireEvent.click(screen.getByRole("button", { name: family.checkin.micStop }));
    const note = screen.getByLabelText(family.checkin.noteLabel) as HTMLTextAreaElement;
    expect(note.value).toBe(family.checkin.micSample);
    expect(note.maxLength).toBe(500);
    expect(screen.getByText(family.checkin.noteRemaining(500 - family.checkin.micSample.length))).toBeTruthy();
  });
});

describe("reply mockups", () => {
  it.each(["GREEN", "YELLOW", "RED"] as const)(
    "%s shows icon and word, explanation, one action, a source and the contact last",
    (level) => {
      const { container } = render(<ReplyView level={level} />);
      const badge = container.querySelector(`[data-level="${level}"]`)!;
      expect(badge.textContent).toBe(family.triage[level].label);
      expect(badge.querySelector("svg")).not.toBeNull();
      expect(screen.getByText(family.reply[level].explanation)).toBeTruthy();
      expect(screen.getByText(family.reply[level].action)).toBeTruthy();
      expect(screen.getByText(family.reply.source(family.reply.sampleSource))).toBeTruthy();
      const article = container.querySelector("article")!;
      expect(article.lastElementChild!.textContent).toBe(contact);
    },
  );

  it("RED makes the phone call the main action", () => {
    render(<ReplyView level="RED" />);
    expect(screen.getByRole("button", { name: family.call }).classList.contains("bg-primary")).toBe(true);
  });
});

describe("pickup mockup", () => {
  it("shows the days until the next pickup with the due date", () => {
    render(<PickupMock />);
    expect(screen.getByText("Ambil obat 5 hari lagi")).toBeTruthy();
    expect(screen.getByText(/Jadwal: Sabtu, 17 Oktober 2026/)).toBeTruthy();
    expect(screen.queryByText(family.pickup.nudgeTitle)).toBeNull(); // no nudge earlier than 2 days
  });

  it("nudges from the day before and shows the contact when overdue", () => {
    render(<PickupMock />);
    const state = screen.getByRole("combobox");
    fireEvent.change(state, { target: { value: "tomorrow" } });
    expect(screen.getByText(family.pickup.tomorrow)).toBeTruthy();
    expect(screen.getByText(family.pickup.nudgeTitle)).toBeTruthy();
    fireEvent.change(state, { target: { value: "today" } });
    expect(screen.getAllByText(family.pickup.today).length).toBeGreaterThan(0);
    fireEvent.change(state, { target: { value: "overdue" } });
    expect(screen.getAllByText(family.pickup.overdue).length).toBeGreaterThan(0);
    expect(screen.getByText(contact)).toBeTruthy();
  });
});

describe("'Tanya' mockup", () => {
  it("asks for a question when it is empty", () => {
    render(<AskMock />);
    fireEvent.click(screen.getByRole("button", { name: family.ask.submit }));
    expect(screen.getByRole("alert").textContent).toBe(family.ask.empty);
  });

  it("answers the first example with a source and the contact", () => {
    render(<AskMock />);
    fireEvent.click(screen.getByRole("button", { name: family.ask.exampleAnswered }));
    fireEvent.click(screen.getByRole("button", { name: family.ask.submit }));
    expect(screen.getByText(family.ask.sampleAnswer)).toBeTruthy();
    expect(screen.getByText(family.reply.source(family.reply.sampleSource))).toBeTruthy();
    expect(screen.getByText(contact)).toBeTruthy();
  });

  it("abstains on the dosing example with the exact wording followed by the contact", () => {
    render(<AskMock />);
    fireEvent.click(screen.getByRole("button", { name: family.ask.exampleAbstain }));
    fireEvent.click(screen.getByRole("button", { name: family.ask.submit }));
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(`Saya belum bisa menjawab ini, tanyakan ke perawat${contact}`);
    expect(screen.queryByText(family.ask.sampleAnswer)).toBeNull();
  });
});

describe("nurse queue mockup", () => {
  it("lists entries from highest score to lowest with reason and one suggested action", () => {
    const { container } = render(<QueueMock />);
    const entries = Array.from(container.querySelectorAll("ol > li"));
    expect(entries).toHaveLength(mockQueue.length);
    const scores = mockQueue.map((q) => q.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    entries.forEach((li, i) => {
      const q = mockQueue[i];
      expect(li.textContent).toContain(q.code);
      expect(li.textContent).toContain(nurse.queue.day(q.day));
      expect(li.textContent).toContain(nurse.queue.score(q.score));
      expect(li.textContent).toContain(nurse.triageShort[q.level]);
      expect(li.textContent).toContain(q.reason);
      expect(li.textContent).toContain(nurse.queue.actions[q.action]);
    });
  });

  it("shows 'Tidak ada tindakan' instead of a button for a score of 0", () => {
    render(<QueueMock />);
    expect(screen.getByText(nurse.queue.actions.none).tagName).toBe("P");
  });
});

describe("RED alert inbox mockup", () => {
  it("acknowledging an alert marks it and lowers the open count by one", () => {
    render(<AlertInboxMock />);
    expect(screen.getByRole("status").textContent).toBe(nurse.alerts.open(mockAlerts.length));
    const buttons = screen.getAllByRole("button", { name: nurse.alerts.acknowledge });
    expect(buttons).toHaveLength(mockAlerts.length);

    fireEvent.click(buttons[0]);
    expect(screen.getByRole("status").textContent).toBe(nurse.alerts.open(mockAlerts.length - 1));
    expect(screen.getByText(nurse.alerts.acknowledgedTitle)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: nurse.alerts.acknowledge })).toHaveLength(mockAlerts.length - 1);

    fireEvent.click(screen.getByRole("button", { name: nurse.alerts.acknowledge }));
    expect(screen.getByRole("status").textContent).toContain(nurse.alerts.allClear);
  });

  it("shows code, day, red flags and time, and no family contact", () => {
    const { container } = render(<AlertInboxMock />);
    for (const a of mockAlerts) {
      expect(container.textContent).toContain(a.code);
      expect(container.textContent).toContain(nurse.alerts.receivedAt(a.time));
      for (const flag of a.flags) expect(container.textContent).toContain(flag);
    }
    expect(container.textContent).not.toMatch(/08\d{8,}/);
  });
});

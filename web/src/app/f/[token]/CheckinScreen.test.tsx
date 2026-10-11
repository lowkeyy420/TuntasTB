// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { copy } from "@/copy/family.id";
import { findRulesDir, loadRulesFromDir, readRuleJson } from "@/lib/triage/loadFiles";
import type { Lexicon, TriageTable } from "@/lib/triage/types";
import { closeDb, DB_NAME } from "@/lib/offline/idb";
import { countQueued } from "@/lib/offline/outbox";
import { CheckinScreen } from "./CheckinScreen";

const TOKEN = "T".repeat(43);
const FORBIDDEN = /\b(TB|TBC|tuberkulosis|TuntasTB)\b/i;
const session = { treatmentDay: 18, puskesmasName: "Demo", puskesmasPhone: "021-555 0100" };
const rules = loadRulesFromDir();

const table = readRuleJson(findRulesDir(), "triage-table.json") as TriageTable;
const lexicon = readRuleJson(findRulesDir(), "lexicon.id.json") as Lexicon;
const bundle = (tbl: TriageTable = table) => ({ version: "t", table: tbl, lexicon });

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function serverReply(level: "GREEN" | "YELLOW" | "RED" = "GREEN") {
  return {
    checkinId: "srv-1",
    level,
    message: rules.table.levels[level].message_id,
    action: rules.table.levels[level].action_id,
    citations: [{ id: "x#y", label: "Panduan efek samping obat" }],
    contact: { name: "Demo", phone: "021-555 0100" },
    fallbackUsed: true,
    warning: rules.table.fallback_warning_id,
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;
let postsOnline = true;
let rulesBundle = bundle();
let postedLevel: "GREEN" | "YELLOW" | "RED" = "GREEN";

const posts = () => fetchSpy.mock.calls.filter(([url]) => url === "/api/checkins");
const postedBody = (i = 0) => JSON.parse(posts()[i][1].body as string);

beforeEach(async () => {
  postsOnline = true;
  rulesBundle = bundle();
  postedLevel = "GREEN";
  fetchSpy = vi.fn(async (url: string) => {
    if (url === "/api/family/rules") return jsonRes(rulesBundle);
    if (url === "/api/checkins") {
      if (!postsOnline) throw new TypeError("Failed to fetch");
      return jsonRes(serverReply(postedLevel));
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

async function open() {
  const view = render(<CheckinScreen token={TOKEN} session={session} today="2026-03-18" />);
  await screen.findAllByRole("checkbox");
  return view;
}

const pick = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const send = () => screen.getByRole("button", { name: copy.checkin.send });

describe("check-in screen content (4.2)", () => {
  it("shows the question, the three answers, the note and the day", async () => {
    await open();
    expect(screen.getByRole("group", { name: "Obat hari ini sudah diminum?" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual([
      "Sudah",
      "Belum",
      "Sebagian",
    ]);
    expect(screen.getByLabelText(copy.checkin.noteLabel)).toBeTruthy();
    expect(screen.getByText(copy.home.dayLabel(18))).toBeTruthy();
    expect(screen.getByText(copy.home.todayPrompt)).toBeTruthy();
  });

  it("renders one chip per symptom in the triage table, with the table's words", async () => {
    await open();
    const chips = screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent);
    expect(chips).toEqual(rules.table.symptoms.map((s) => s.label_id));
    for (const chip of screen.getAllByRole("checkbox")) {
      expect(chip.closest("label")!.querySelector("svg")).not.toBeNull();
    }
  });

  it("a symptom added to the table appears as a chip with no change to the screen", async () => {
    rulesBundle = bundle({
      ...table,
      symptoms: [...table.symptoms, { code: "dizzy_new", level: "YELLOW", label_id: "Pusing berputar", chip_only: true }],
    });
    await open();
    expect(screen.getByRole("checkbox", { name: "Pusing berputar" })).toBeTruthy();
  });

  it("keeps Kirim disabled until a dose answer is chosen", async () => {
    await open();
    expect((send() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(copy.checkin.sendBlocked)).toBeTruthy();
    pick("Sudah");
    expect((send() as HTMLButtonElement).disabled).toBe(false);
  });

  it("stops the note at 500 characters and shows what is left", async () => {
    await open();
    const note = screen.getByLabelText(copy.checkin.noteLabel) as HTMLTextAreaElement;
    expect(note.maxLength).toBe(500);
    expect(screen.getByText(copy.checkin.noteRemaining(500))).toBeTruthy();
    fireEvent.change(note, { target: { value: "a".repeat(120) } });
    expect(screen.getByText(copy.checkin.noteRemaining(380))).toBeTruthy();
  });

  it("names no illness and has no more than one primary action", async () => {
    const { container } = await open();
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(container.textContent).not.toMatch(/\baman\b/i);
    const primary = Array.from(container.querySelectorAll("button, a")).filter((e) =>
      e.classList.contains("bg-primary"),
    );
    expect(primary.length).toBeLessThanOrEqual(1);
  });

  it("says so, and cannot send, when there are no rules on the device and no connection", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    render(<CheckinScreen token={TOKEN} session={session} today="2026-03-18" />);
    await screen.findByText(copy.checkin.noRules);
    pick("Sudah");
    expect((send() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("taps (4.4 at component level)", () => {
  it("dose + one chip + Kirim is three taps; dose + Kirim is two", async () => {
    await open();
    fireEvent.click(screen.getByRole("radio", { name: "Sudah" })); // 1
    fireEvent.click(screen.getByRole("checkbox", { name: table.symptoms[1].label_id })); // 2
    expect(posts()).toHaveLength(0);
    fireEvent.click(send()); // 3
    await screen.findByText(copy.triage.GREEN.label);
    expect(posts()).toHaveLength(1);
    expect(postedBody().chips).toEqual([table.symptoms[1].code]);

    fireEvent.click(screen.getByRole("button", { name: copy.reply.done }));
    fireEvent.click(await screen.findByRole("radio", { name: "Sudah" })); // 1
    fireEvent.click(send()); // 2
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(postedBody(1).chips).toEqual([]);
  });
});

describe("online reply (4.5)", () => {
  it("RED: icon and word, the Puskesmas/IGD action, a call link, the contact last, and Terkirim", async () => {
    postedLevel = "RED";
    const { container } = await open();
    pick("Sudah");
    fireEvent.change(screen.getByLabelText(copy.checkin.noteLabel), { target: { value: "matanya kuning" } });
    fireEvent.click(send());

    await screen.findByText(copy.triage.RED.label);
    expect(container.querySelector('[data-level="RED"] svg')).not.toBeNull();
    expect(screen.getByText(rules.table.levels.RED.action_id)).toBeTruthy();
    expect(screen.getByText(rules.table.levels.RED.message_id)).toBeTruthy();
    expect(screen.getByText(`Sumber: Panduan efek samping obat`)).toBeTruthy();
    expect(screen.getByText(copy.checkin.statusSent)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.call }).getAttribute("href")).toBe("tel:0215550100");
    expect(container.querySelector("article")!.lastElementChild!.textContent).toBe(
      "Puskesmas Demo, telepon 021-555 0100.",
    );
    expect(container.textContent).not.toMatch(/\baman\b/i);
    expect(postedBody().text).toBe("matanya kuning");
  });

  it("shows the standing warning on the reply when the flow was not used", async () => {
    await open();
    pick("Sudah");
    fireEvent.click(send());
    await screen.findByText(rules.table.fallback_warning_id);
  });

  it("a 429 keeps the form and says so", async () => {
    fetchSpy.mockImplementation(async (url: string) =>
      url === "/api/family/rules" ? jsonRes(rulesBundle) : jsonRes({ error: "too_many" }, 429),
    );
    await open();
    pick("Sudah");
    fireEvent.click(send());
    await screen.findByText(copy.checkin.tooMany);
    expect(screen.getByRole("radio", { name: "Sudah" })).toBeTruthy();
    expect(await countQueued()).toBe(0);
  });
});

describe("offline (6.4, 6.5 at component level)", () => {
  async function submitOffline(note: string, level: "GREEN" | "RED" = "GREEN") {
    postedLevel = level;
    const view = await open();
    postsOnline = false;
    pick("Sudah");
    fireEvent.change(screen.getByLabelText(copy.checkin.noteLabel), { target: { value: note } });
    fireEvent.click(send());
    await screen.findByText(copy.checkin.queued);
    return view;
  }

  it("saves the check-in on the device and says it is not sent yet", async () => {
    await submitOffline("mual");
    expect(await countQueued()).toBe(1);
    expect(screen.queryByText(copy.checkin.statusSent)).toBeNull();
    // A provisional non-RED reply carries the standing warning.
    expect(screen.getByText(rules.table.fallback_warning_id)).toBeTruthy();
  });

  it("offline RED: go today, the nurse has not received it, the number to call", async () => {
    const { container } = await submitOffline("matanya kuning", "RED");
    expect(screen.getByText(copy.triage.RED.label)).toBeTruthy();
    expect(screen.getByText(copy.reply.offline.redAction)).toBeTruthy();
    expect(screen.getByText(copy.reply.offline.redNotice)).toBeTruthy();
    expect(container.querySelector("article")!.lastElementChild!.textContent).toBe(
      "Telepon Puskesmas: 021-555 0100.",
    );
    expect(screen.getByRole("link", { name: copy.call }).getAttribute("href")).toBe("tel:0215550100");
    expect(container.textContent).not.toContain("Perawat sudah diberi tahu");
  });

  it("when the connection returns the server's reply replaces the provisional one and shows Terkirim", async () => {
    await submitOffline("matanya kuning", "RED");
    expect(screen.getByText(copy.reply.offline.redNotice)).toBeTruthy();

    postsOnline = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await screen.findByText(copy.checkin.statusSent);
    expect(screen.getByText(rules.table.levels.RED.message_id)).toBeTruthy();
    expect(screen.queryByText(copy.reply.offline.redNotice)).toBeNull();
    expect(screen.queryByText(copy.checkin.queued)).toBeNull();
    // The same check-in id went out twice (the failed try and the retry), so the server stores it once.
    expect(posts()).toHaveLength(2);
    expect(postedBody(0).clientId).toBe(postedBody(1).clientId);
    expect(await countQueued()).toBe(0);
  });

  it("the unsent count is shown on the form after Selesai", async () => {
    await submitOffline("mual");
    fireEvent.click(screen.getByRole("button", { name: copy.reply.done }));
    await screen.findByText(copy.checkin.queuedCount(1));
  });

  it("without a connection at all, no request is attempted and the check-in is queued", async () => {
    await open();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await screen.findByText(copy.checkin.offlineNotice);
    pick("Sudah");
    fireEvent.click(send());
    await screen.findByText(copy.checkin.queued);
    expect(posts()).toHaveLength(0);
  });
});

describe("voice note (5.1, 5.2)", () => {
  class FakeRecognition {
    static last: FakeRecognition | null = null;
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    start() {
      FakeRecognition.last = this;
    }
    stop() {
      this.onend?.();
    }
    abort() {}
    say(text: string) {
      this.onresult?.({ results: [[{ transcript: text }]] });
    }
  }

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    FakeRecognition.last = null;
  });

  it("has no microphone button when the device cannot recognise speech, and the note still works", async () => {
    await open();
    expect(screen.queryByRole("button", { name: copy.checkin.mic })).toBeNull();
    expect(screen.queryByText(copy.checkin.micHint)).toBeNull();
    fireEvent.change(screen.getByLabelText(copy.checkin.noteLabel), { target: { value: "mual" } });
    expect((screen.getByLabelText(copy.checkin.noteLabel) as HTMLTextAreaElement).value).toBe("mual");
  });

  it("puts the Indonesian transcript in the note, editable, with the hint to leave out names", async () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
    await open();
    const note = screen.getByLabelText(copy.checkin.noteLabel) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "dari pagi" } });
    expect(screen.getByText(copy.checkin.micHint)).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: copy.checkin.mic }));
    expect(FakeRecognition.last?.lang).toBe("id-ID");
    expect(FakeRecognition.last?.interimResults).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(copy.checkin.micListening);

    act(() => FakeRecognition.last!.say("mual terus"));
    expect(note.value).toBe("dari pagi mual terus");
    act(() => FakeRecognition.last!.say("mual terus, matanya agak kuning"));
    expect(note.value).toBe("dari pagi mual terus, matanya agak kuning");

    fireEvent.click(screen.getByRole("button", { name: copy.checkin.micStop }));
    expect(screen.getByRole("button", { name: copy.checkin.mic })).toBeTruthy();
    fireEvent.change(note, { target: { value: `${note.value} dan pusing` } });
    expect(note.value).toMatch(/dan pusing$/);
  });

  it("keeps the dictated note within 500 characters", async () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    await open();
    fireEvent.click(await screen.findByRole("button", { name: copy.checkin.mic }));
    act(() => FakeRecognition.last!.say("a".repeat(900)));
    expect((screen.getByLabelText(copy.checkin.noteLabel) as HTMLTextAreaElement).value).toHaveLength(500);
  });

  it("submits only JSON text fields after dictation: the transcript and no audio", async () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
    await open();
    fireEvent.click(await screen.findByRole("button", { name: copy.checkin.mic }));
    act(() => FakeRecognition.last!.say("mual terus, matanya agak kuning"));
    fireEvent.click(screen.getByRole("button", { name: copy.checkin.micStop }));
    pick("Sudah");
    fireEvent.click(send());
    await screen.findByText(copy.triage.GREEN.label);

    const [, init] = posts()[0];
    expect(typeof init.body).toBe("string");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(["chips", "clientId", "doseStatus", "occurredOn", "text"]);
    expect(body.text).toBe("mual terus, matanya agak kuning");
    expect(typeof body.text).toBe("string");
    expect(Array.isArray(body.chips)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/audio|blob|base64/i);
  });
});

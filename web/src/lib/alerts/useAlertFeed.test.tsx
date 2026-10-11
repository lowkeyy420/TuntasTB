// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  ERRORS_BEFORE_POLLING,
  FALLBACK_POLL_MS,
  RECONNECT_MS,
  SAFETY_POLL_MS,
  useAlertFeed,
  type AlertFeedOptions,
} from "./useAlertFeed";
import type { AlertItem } from "./types";

/** A stand-in for the browser's EventSource that the test drives by hand. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Array<(e: Event) => void>>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  /** The browser reports a failed attempt and will retry by itself. */
  fail() {
    this.readyState = 0;
    this.onerror?.();
  }
  /** The browser gave up (for example after a 503). */
  giveUp() {
    this.readyState = 2;
    this.onerror?.();
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent);
  }
}
const sources = () => FakeEventSource.instances;
const latest = () => sources().at(-1)!;

const alert = (id: string, over: Partial<AlertItem> = {}): AlertItem => ({
  id,
  patientId: `p-${id}`,
  code: `KODE-${id}`,
  day: 9,
  flags: ["Penglihatan kabur"],
  time: "07.42",
  createdAt: `2026-03-20T00:4${id.length}:00.000Z`,
  acknowledged: false,
  acknowledgedBy: null,
  acknowledgedAt: null,
  acknowledgedTime: null,
  ...over,
});
const acked = (id: string): AlertItem =>
  alert(id, { acknowledged: true, acknowledgedBy: "perawat@demo.id", acknowledgedAt: "2026-03-20T00:50:00.000Z", acknowledgedTime: "07.50" });

let server: AlertItem[];
let fetchMock: ReturnType<typeof vi.fn>;
const polls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("poll=1")).length;

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function mount(options: AlertFeedOptions = {}) {
  const view = renderHook(() => useAlertFeed(options));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return view;
}
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  server = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const id = /alerts\/([^/]+)\/ack/.exec(url)![1];
      return jsonRes({ alert: acked(id), alreadyAcknowledged: false });
    }
    return jsonRes({ alerts: server });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAlertFeed: live stream (nurse-queue 3.5)", () => {
  it("loads the current alerts, opens the stream and shows created and acknowledged events", async () => {
    server = [alert("a"), acked("z")];
    const onCreated = vi.fn();
    const { result } = await mount({ onCreated });
    expect(result.current.loaded).toBe(true);
    expect(result.current.alerts.map((a) => a.id)).toEqual(["a", "z"]);
    expect(latest().url).toBe("/api/nurse/alerts/stream");
    expect(result.current.mode).toBe("connecting");

    act(() => latest().open());
    expect(result.current.mode).toBe("live");
    expect(onCreated).not.toHaveBeenCalled(); // the first load is not "new"

    act(() => latest().emit("alert.created", { alert: alert("bb") }));
    expect(result.current.alerts.map((a) => a.id)).toEqual(["bb", "a", "z"]); // newest open alert first
    expect(result.current.openCount).toBe(2);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated.mock.calls[0][0].id).toBe("bb");

    // The same event again is not announced twice.
    act(() => latest().emit("alert.created", { alert: alert("bb") }));
    expect(onCreated).toHaveBeenCalledTimes(1);

    act(() => latest().emit("alert.acknowledged", { alert: acked("bb") }));
    expect(result.current.openCount).toBe(1);
    expect(result.current.alerts.find((a) => a.id === "bb")?.acknowledged).toBe(true);
    expect(result.current.alerts.map((a) => a.id)).toEqual(["a", "bb", "z"]); // open first, then the log
  });

  it("the snapshot adds open alerts and re-reads the list when one we show as open is gone", async () => {
    server = [alert("a")];
    const { result } = await mount();
    act(() => latest().open());
    const before = fetchMock.mock.calls.length;

    act(() => latest().emit("alerts.snapshot", { alerts: [alert("a"), alert("cc")] }));
    expect(result.current.alerts.map((a) => a.id).sort()).toEqual(["a", "cc"]);
    expect(fetchMock.mock.calls.length).toBe(before); // nothing missing: no extra read

    server = [acked("a"), alert("cc")];
    act(() => latest().emit("alerts.snapshot", { alerts: [alert("cc")] })); // "a" was taken while we were away
    await tick(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    expect(result.current.alerts.find((a) => a.id === "a")?.acknowledged).toBe(true);
  });

  it("keeps a safety poll every 30 seconds while the stream is up (and none faster)", async () => {
    await mount();
    act(() => latest().open());
    await tick(SAFETY_POLL_MS - 1);
    expect(polls()).toBe(0);
    await tick(1);
    expect(polls()).toBe(1);
    await tick(SAFETY_POLL_MS);
    expect(polls()).toBe(2);
  });
});

describe("useAlertFeed: fallback polling (nurse-queue 3.5)", () => {
  it("polls every 3 seconds after two errors in a row, so a RED alert shows within 5 seconds", async () => {
    const onCreated = vi.fn();
    const { result } = await mount({ onCreated });
    act(() => latest().fail());
    expect(result.current.mode).toBe("connecting"); // one error is not enough
    expect(ERRORS_BEFORE_POLLING).toBe(2);
    await tick(FALLBACK_POLL_MS);
    expect(polls()).toBe(0);

    act(() => latest().fail());
    expect(result.current.mode).toBe("polling");

    server = [alert("new")];
    await tick(FALLBACK_POLL_MS);
    expect(polls()).toBe(1);
    expect(result.current.alerts.map((a) => a.id)).toEqual(["new"]);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/nurse/alerts?status=all&poll=1");

    await tick(FALLBACK_POLL_MS);
    expect(polls()).toBe(2);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("goes back to the stream when it reconnects, and stops the fast poll", async () => {
    const { result } = await mount();
    act(() => latest().fail());
    act(() => latest().fail());
    await tick(FALLBACK_POLL_MS);
    expect(polls()).toBe(1);

    act(() => latest().open());
    expect(result.current.mode).toBe("live");
    await tick(FALLBACK_POLL_MS * 3);
    expect(polls()).toBe(1);
  });

  it("counts only consecutive errors: an error, a successful connection, then another error stays live", async () => {
    const { result } = await mount();
    act(() => latest().fail());
    act(() => latest().open());
    act(() => latest().fail());
    expect(result.current.mode).toBe("live");
    await tick(FALLBACK_POLL_MS);
    expect(polls()).toBe(0);
  });

  it("polls straight away when EventSource does not exist", async () => {
    vi.stubGlobal("EventSource", undefined);
    server = [alert("a")];
    const { result } = await mount();
    expect(sources()).toHaveLength(0);
    expect(result.current.mode).toBe("polling");
    server = [alert("a"), alert("bb")];
    await tick(FALLBACK_POLL_MS);
    expect(result.current.alerts.map((a) => a.id)).toEqual(["bb", "a"]);
  });

  it("opens a new connection after the browser gave up on the old one", async () => {
    await mount();
    expect(sources()).toHaveLength(1);
    act(() => latest().giveUp());
    expect(sources()[0].closed).toBe(true);
    await tick(RECONNECT_MS - 1);
    expect(sources()).toHaveLength(1);
    await tick(1);
    expect(sources()).toHaveLength(2);
    expect(latest().closed).toBe(false);
  });
});

describe("useAlertFeed: loading, acknowledging and cleaning up", () => {
  it("reports a failed first load, then recovers on refresh", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = await mount();
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBe(true);
    server = [alert("a")];
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe(false);
    expect(result.current.alerts).toHaveLength(1);
  });

  it("a failed poll after a good load keeps what is shown", async () => {
    server = [alert("a")];
    const { result } = await mount();
    fetchMock.mockResolvedValueOnce(jsonRes({}, 500));
    await tick(SAFETY_POLL_MS);
    expect(result.current.error).toBe(false);
    expect(result.current.alerts).toHaveLength(1);
  });

  it("a 401 tells the console the session is over", async () => {
    const onUnauthorized = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonRes({ error: "unauthorized" }, 401));
    await mount({ onUnauthorized });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("acknowledge sends the request and shows the stored acknowledgement", async () => {
    server = [alert("a")];
    const { result } = await mount();
    let ok = false;
    await act(async () => {
      ok = await result.current.acknowledge("a");
    });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/nurse/alerts/a/ack", { method: "POST" });
    expect(result.current.openCount).toBe(0);
    expect(result.current.alerts[0]).toMatchObject({ acknowledged: true, acknowledgedBy: "perawat@demo.id" });
  });

  it("acknowledge reports failure (server error, network error, expired session) and changes nothing", async () => {
    server = [alert("a")];
    const onUnauthorized = vi.fn();
    const { result } = await mount({ onUnauthorized });
    const results: boolean[] = [];
    for (const next of [
      () => jsonRes({}, 500),
      () => {
        throw new TypeError("offline");
      },
      () => jsonRes({}, 401),
    ]) {
      fetchMock.mockImplementationOnce(async () => next());
      await act(async () => {
        results.push(await result.current.acknowledge("a"));
      });
    }
    expect(results).toEqual([false, false, false]);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(result.current.openCount).toBe(1);
  });

  it("closes the stream and stops every timer on unmount", async () => {
    const { unmount } = await mount();
    act(() => latest().fail());
    act(() => latest().fail());
    const before = fetchMock.mock.calls.length;
    unmount();
    expect(sources()[0].closed).toBe(true);
    await tick(SAFETY_POLL_MS * 2);
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

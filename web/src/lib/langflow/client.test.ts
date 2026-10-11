import { describe, expect, it, vi } from "vitest";
import { chatOutputText, createFlowClient } from "./client";

/** add-symptom-extraction 4.3. */
const runResponse = (text: string) => ({
  session_id: "s",
  outputs: [{ inputs: {}, outputs: [{ results: { message: { text } } }] }],
});

const okFetch = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

describe("runFlow", () => {
  it("success: posts the chat payload with x-api-key and returns the output text", async () => {
    const fetchImpl = okFetch(runResponse('{"level":"RED"}'));
    const run = createFlowClient({ baseUrl: "http://lf:7860/", apiKey: "k-test", fetchImpl });
    expect(await run("checkin_triage", { text: "mual" })).toEqual({ ok: true, text: '{"level":"RED"}' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://lf:7860/api/v1/run/checkin_triage");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("k-test");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ input_value: '{"text":"mual"}', input_type: "chat", output_type: "chat" });
  });

  it("timeout: aborts after the timeout and reports it", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      );
      const run = createFlowClient({ baseUrl: "http://lf", apiKey: "k", fetchImpl });
      const pending = run("checkin_triage", {});
      await vi.advanceTimersByTimeAsync(14_999);
      let settled = false;
      void pending.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ ok: false, reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("network error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const run = createFlowClient({ baseUrl: "http://lf", apiKey: "k", fetchImpl });
    expect(await run("checkin_triage", {})).toEqual({ ok: false, reason: "network" });
  });

  it("HTTP 500", async () => {
    const run = createFlowClient({ baseUrl: "http://lf", apiKey: "k", fetchImpl: okFetch({ detail: "x" }, 500) });
    expect(await run("checkin_triage", {})).toEqual({ ok: false, reason: "http", status: 500 });
  });

  it("unexpected response shape", async () => {
    for (const body of [{ outputs: [] }, { result: "x" }, { outputs: [{ outputs: [{ results: {} }] }] }]) {
      const run = createFlowClient({ baseUrl: "http://lf", apiKey: "k", fetchImpl: okFetch(body) });
      expect(await run("checkin_triage", {})).toEqual({ ok: false, reason: "shape" });
    }
    const notJson = vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 }));
    const run = createFlowClient({ baseUrl: "http://lf", apiKey: "k", fetchImpl: notJson });
    expect(await run("checkin_triage", {})).toEqual({ ok: false, reason: "shape" });
  });

  it("no key configured: no request at all", async () => {
    const fetchImpl = okFetch(runResponse("{}"));
    for (const apiKey of [undefined, ""]) {
      const run = createFlowClient({ baseUrl: "http://lf", apiKey, fetchImpl });
      expect(await run("checkin_triage", {})).toEqual({ ok: false, reason: "disabled" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a string input is sent as is", async () => {
    const fetchImpl = okFetch(runResponse("ok"));
    await createFlowClient({ baseUrl: "http://lf", apiKey: "k", fetchImpl })("x", "plain");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).input_value).toBe("plain");
  });
});

describe("chatOutputText", () => {
  it("skips runs without a message", () => {
    expect(chatOutputText({ outputs: [{ outputs: [{}] }, { outputs: [{ results: { message: { text: "b" } } }] }] })).toBe("b");
    expect(chatOutputText(null)).toBeNull();
    expect(chatOutputText({ outputs: [{}] })).toBeNull();
  });
});

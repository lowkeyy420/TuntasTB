import { describe, expect, it, vi } from "vitest";
import { SlidingWindowLimiter } from "./limiter";
import { callAskFlow } from "./flow";
import { manifestFromJson } from "./manifest";

describe("SlidingWindowLimiter", () => {
  it("allows the limit, refuses the next, and frees a slot after the window", () => {
    const l = new SlidingWindowLimiter(3, 1000);
    expect([l.tryHit("a", 0), l.tryHit("a", 10), l.tryHit("a", 20)]).toEqual([true, true, true]);
    expect(l.tryHit("a", 30)).toBe(false);
    expect(l.tryHit("b", 30)).toBe(true); // another key is independent
    expect(l.tryHit("a", 1001)).toBe(true); // the first hit left the window
    expect(l.tryHit("a", 1002)).toBe(false);
  });

  it("a refused hit is not recorded", () => {
    const l = new SlidingWindowLimiter(1, 1000);
    l.tryHit("a", 0);
    for (let t = 1; t < 900; t += 100) expect(l.tryHit("a", t)).toBe(false);
    expect(l.tryHit("a", 1000)).toBe(true);
  });

  it("reset clears every key", () => {
    const l = new SlidingWindowLimiter(1, 1000);
    l.tryHit("a", 0);
    l.reset();
    expect(l.tryHit("a", 1)).toBe(true);
  });
});

describe("manifestFromJson", () => {
  it("maps section ids to labels and skips malformed entries", () => {
    expect(
      manifestFromJson({
        sections: [{ id: "a#b", label: "Label" }, { id: "", label: "x" }, { id: "c#d" }, null, { id: "e#f", label: "  " }],
      }),
    ).toEqual({ "a#b": { label: "Label" } });
  });

  it.each([null, {}, { sections: "x" }, 5])("gives an empty manifest for %j", (raw) => {
    expect(manifestFromJson(raw)).toEqual({});
  });
});

describe("callAskFlow", () => {
  const out = { answer: "", citations: [], retrieved_ids: [], abstained: true };
  const langflowBody = (text: unknown) => ({ outputs: [{ outputs: [{ results: { message: { text } } }] }] });
  const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("posts the payload to the run endpoint with the key in a header and parses the chat output", async () => {
    const fetchImpl = respond(200, langflowBody(JSON.stringify(out)));
    const result = await callAskFlow(
      { question: "boleh puasa?" },
      { baseUrl: "http://lf:7860/", apiKey: "k-123", timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result).toEqual(out);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://lf:7860/api/v1/run/ask_guideline");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k-123");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ input_type: "chat", output_type: "chat" });
    expect(JSON.parse(body.input_value)).toEqual({ question: "boleh puasa?" });
  });

  it("rejects without an API key (rules-only mode) and makes no request", async () => {
    const fetchImpl = respond(200, {});
    await expect(
      callAskFlow({ question: "x y z" }, { baseUrl: "http://lf", apiKey: undefined, timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["a 500", respond(500, {})],
    ["a missing output", respond(200, { outputs: [] })],
    ["output that is not JSON", respond(200, langflowBody("<html>"))],
    ["a non-string output", respond(200, langflowBody(42))],
  ])("rejects on %s", async (_n, fetchImpl) => {
    await expect(
      callAskFlow({ question: "x y z" }, { baseUrl: "http://lf", apiKey: "k", timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow();
  });

  it("rejects when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      callAskFlow({ question: "x y z" }, { baseUrl: "http://lf", apiKey: "k", timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("fetch failed");
  });
});

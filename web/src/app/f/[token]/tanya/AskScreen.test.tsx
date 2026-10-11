// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { copy } from "@/copy/family.id";
import { AskScreen } from "./AskScreen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const contact = { name: "Kebon Jeruk", phone: "021-555-0100" };
const contactLine = copy.contact(contact.name, contact.phone);
const TOKEN = "t".repeat(43);

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

function ask(text: string) {
  fireEvent.change(screen.getByLabelText(copy.ask.label), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: copy.ask.submit }));
}

/** The response block: everything that is not the action bar. */
const responseText = (container: HTMLElement) =>
  container.querySelector("article, [role=status], [role=alert]")?.textContent ?? "";

describe("AskScreen", () => {
  it("asks for a question when it is empty and sends nothing", () => {
    const fetchFn = stubFetch(() => reply(200));
    render(<AskScreen token={TOKEN} contact={contact} />);
    fireEvent.click(screen.getByRole("button", { name: copy.ask.submit }));
    expect(screen.getByRole("alert").textContent).toBe(copy.ask.empty);
    ask("  a ");
    expect(screen.getByRole("alert").textContent).toBe(copy.ask.empty);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("shows the counter and stops the field at 300 characters", () => {
    render(<AskScreen token={TOKEN} contact={contact} />);
    expect((screen.getByLabelText(copy.ask.label) as HTMLTextAreaElement).maxLength).toBe(300);
    expect(screen.getByText(copy.checkin.noteRemaining(300))).toBeTruthy();
    fireEvent.change(screen.getByLabelText(copy.ask.label), { target: { value: "halo" } });
    expect(screen.getByText(copy.checkin.noteRemaining(296))).toBeTruthy();
  });

  it("sends the trimmed question with the link token and shows a cited answer, contact last", async () => {
    const fetchFn = stubFetch(() =>
      reply(200, {
        kind: "answer",
        text: "Air kencing merah sering terjadi karena obat.",
        citations: [{ id: "a#b", label: "Panduan efek samping obat" }],
        contact,
      }),
    );
    const { container } = render(<AskScreen token={TOKEN} contact={contact} />);
    ask("  kenapa kencingnya jadi merah?  ");
    await screen.findByText("Air kencing merah sering terjadi karena obat.");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/ask");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ question: "kenapa kencingnya jadi merah?" });
    expect(screen.getByText(copy.reply.source("Panduan efek samping obat"))).toBeTruthy();
    expect(responseText(container).endsWith(contactLine)).toBe(true);
  });

  it("shows the exact abstain sentence followed by the contact", async () => {
    stubFetch(() => reply(200, { kind: "abstain", text: copy.ask.abstain, citations: [], contact }));
    const { container } = render(<AskScreen token={TOKEN} contact={contact} />);
    ask("berapa harga motor bekas?");
    await screen.findByText(copy.ask.abstain);
    expect(screen.getByRole("status").textContent).toBe(`Saya belum bisa menjawab ini, tanyakan ke perawat${contactLine}`);
    expect(container.textContent).not.toContain(copy.ask.sampleAnswer);
  });

  it("shows the go-today instruction, a call link and a link to the check-in for an urgent question", async () => {
    stubFetch(() => reply(200, { kind: "urgent", text: copy.ask.urgent, citations: [], contact }));
    const { container } = render(<AskScreen token={TOKEN} contact={contact} />);
    ask("matanya kuning itu normal?");
    await screen.findByText(copy.ask.urgent);
    expect(responseText(container).endsWith(contactLine)).toBe(true);
    expect(screen.getByRole("link", { name: copy.call }).getAttribute("href")).toBe("tel:0215550100");
    expect(screen.getByRole("link", { name: copy.ask.sendCheckin }).getAttribute("href")).toBe(`/f/${TOKEN}`);
  });

  it("says to try later with the contact after a 429", async () => {
    stubFetch(() => reply(429, { error: "too_many" }));
    const { container } = render(<AskScreen token={TOKEN} contact={contact} />);
    ask("kenapa kencingnya jadi merah?");
    await screen.findByText(copy.ask.rateLimited);
    expect(responseText(container).endsWith(contactLine)).toBe(true);
  });

  it("shows a failure with the contact after a server error", async () => {
    stubFetch(() => reply(500, { error: "server" }));
    const { container } = render(<AskScreen token={TOKEN} contact={contact} />);
    ask("kenapa kencingnya jadi merah?");
    await screen.findByText(copy.ask.failed);
    expect(responseText(container).endsWith(contactLine)).toBe(true);
  });

  it("shows the offline state with the cached Puskesmas number when the request cannot reach the server", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const { container } = render(<AskScreen token={TOKEN} contact={contact} />);
    ask("kenapa kencingnya jadi merah?");
    await screen.findByText(copy.ask.offline);
    expect(responseText(container).endsWith(contactLine)).toBe(true);
    expect(screen.getByRole("link", { name: copy.call }).getAttribute("href")).toBe("tel:0215550100");
  });

  it("with no signal, warns at once with the contact and does not let a question be sent", async () => {
    const fetchFn = stubFetch(() => reply(200));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      render(<AskScreen token={TOKEN} contact={contact} />);
      await waitFor(() => expect(screen.getByRole("status").textContent).toContain(copy.ask.offline));
      expect(screen.getByRole("status").textContent?.endsWith(contactLine)).toBe(true);
      const button = screen.getByRole("button", { name: copy.ask.submit }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    }
  });

  it("'Tanya lagi' returns to an empty form", async () => {
    stubFetch(() => reply(200, { kind: "abstain", text: copy.ask.abstain, citations: [], contact }));
    render(<AskScreen token={TOKEN} contact={contact} />);
    ask("berapa harga motor bekas?");
    await screen.findByText(copy.ask.abstain);
    fireEvent.click(screen.getByRole("button", { name: copy.ask.again }));
    expect((screen.getByLabelText(copy.ask.label) as HTMLTextAreaElement).value).toBe("");
  });

  it("names no illness and has no link to staff pages", async () => {
    stubFetch(() => reply(200, { kind: "abstain", text: copy.ask.abstain, citations: [], contact }));
    const { container } = render(<AskScreen token={TOKEN} contact={contact} />);
    expect(container.textContent).not.toMatch(/\b(TB|TBC|tuberkulosis|TuntasTB)\b/i);
    expect(container.querySelector('a[href^="/design"], a[href^="/nurse"], a[href^="/login"]')).toBeNull();
    expect(container.querySelectorAll("button.bg-primary, a.bg-primary").length).toBeLessThanOrEqual(1);
  });
});

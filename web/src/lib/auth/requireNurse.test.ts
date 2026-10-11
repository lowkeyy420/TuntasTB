import { describe, it, expect } from "vitest";
import { requireNurse, UnauthorizedError } from "./requireNurse";
import { createSession, SESSION_COOKIE } from "./session";

const SECRET = "s".repeat(48);

function requestWithCookie(cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost/api/nurse/patients", { headers });
}

describe("requireNurse", () => {
  it("returns the session payload for a valid cookie", async () => {
    const token = await createSession(
      { nurseId: "n1", puskesmasId: "pk1" },
      SECRET,
    );
    const req = requestWithCookie(`${SESSION_COOKIE}=${token}`);
    await expect(requireNurse(req, SECRET)).resolves.toEqual({
      nurseId: "n1",
      puskesmasId: "pk1",
    });
  });

  it("throws without a session cookie", async () => {
    await expect(requireNurse(requestWithCookie(), SECRET)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("throws for a tampered cookie", async () => {
    const req = requestWithCookie(`${SESSION_COOKIE}=not.a.jwt`);
    await expect(requireNurse(req, SECRET)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

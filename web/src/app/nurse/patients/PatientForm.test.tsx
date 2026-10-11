// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { copy } from "@/copy/nurse.id";

const push = vi.fn();
// Like the real hook, return a stable object so effects do not re-run.
const router = { push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { PatientForm } from "./PatientForm";
import { PatientList } from "./PatientList";

const LINK = "http://localhost:3000/f/" + "L".repeat(43);

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
}

describe("registration form (5.1)", () => {
  it("has exactly the five inputs and no name, birth date, address or NIK", () => {
    const { container } = render(<PatientForm />);
    const controls = Array.from(container.querySelectorAll("input, select, textarea"));
    expect(controls.map((c) => c.getAttribute("name"))).toEqual([
      "code",
      "startDate",
      "phase",
      "pickupIntervalDays",
      "pmoPhone",
    ]);
    const identity = /(^|[^a-z])(name|nama|birth|lahir|dob|address|alamat|nik|ktp)([^a-z]|$)/i;
    for (const c of controls) {
      expect(c.getAttribute("name")).not.toMatch(identity);
      expect(c.getAttribute("placeholder") ?? "").not.toMatch(identity);
      expect(c.getAttribute("autocomplete") ?? "").not.toMatch(/name|bday|address/);
    }
    // The only label wording near the word "nama" is the warning not to enter one.
    expect(screen.getByText(copy.patients.form.codeHint)).toBeTruthy();
  });

  it("shows inline Bahasa errors and sends nothing when fields are missing", async () => {
    render(<PatientForm />);
    fill("Kode pasien", "Budi Santoso");
    fireEvent.click(screen.getByRole("button", { name: copy.patients.form.submit }));

    expect(await screen.findByText(copy.patients.validation.startDateRequired)).toBeTruthy();
    expect(screen.getByText(copy.patients.validation.codeFormat)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the allowed range for an out-of-range interval", async () => {
    render(<PatientForm />);
    fill("Kode pasien", "JKT-0042");
    fill("Tanggal mulai", "2024-03-01");
    fill("Jarak ambil obat", "61");
    fireEvent.click(screen.getByRole("button", { name: copy.patients.form.submit }));
    expect(await screen.findByText(copy.patients.validation.pickupRange)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows 'Kode sudah dipakai' when the server reports a duplicate", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonRes({ error: "duplicate_code", fields: { code: "Kode sudah dipakai" } }, 409),
    );
    render(<PatientForm />);
    fill("Kode pasien", "JKT-0042");
    fill("Tanggal mulai", "2024-03-01");
    fireEvent.click(screen.getByRole("button", { name: copy.patients.form.submit }));
    expect(await screen.findByText("Kode sudah dipakai")).toBeTruthy();
  });
});

describe("one-time link modal on create (5.2)", () => {
  it("shows the link with a warning and a copy button, then goes to the list", async () => {
    fetchSpy.mockResolvedValueOnce(jsonRes({ patient: { id: "p1" }, familyLink: LINK }, 201));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<PatientForm />);
    fill("Kode pasien", "jkt-0042"); // typed lowercase is upper-cased
    fill("Tanggal mulai", "2024-03-01");
    fill("Nomor HP PMO", "0812-3456-7890");
    fireEvent.click(screen.getByRole("button", { name: copy.patients.form.submit }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(copy.patients.linkModal.warning);
    expect((screen.getByDisplayValue(LINK) as HTMLInputElement).readOnly).toBe(true);

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      code: "JKT-0042",
      startDate: "2024-03-01",
      phase: "intensive",
      pickupIntervalDays: 14,
      pmoPhone: "0812-3456-7890",
    });

    fireEvent.click(screen.getByRole("button", { name: copy.patients.linkModal.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));

    fireEvent.click(screen.getByRole("button", { name: copy.patients.linkModal.close }));
    expect(push).toHaveBeenCalledWith("/nurse/patients");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("patient list (5.2, 5.3)", () => {
  const row = (over: object = {}) => ({
    id: "11111111-1111-4111-8111-111111111111",
    code: "JKT-0042",
    treatmentDay: 18,
    phase: "intensive",
    hasPmo: true,
    consented: false,
    linkStatus: "active",
    ...over,
  });

  it("shows code, day and status badges and never a link", async () => {
    fetchSpy.mockResolvedValueOnce(jsonRes({ patients: [row()] }));
    const { container } = render(<PatientList />);
    await screen.findByText("JKT-0042");
    expect(container.textContent).toContain("Hari ke- 18");
    expect(container.textContent).toContain(copy.patients.status.consentPending);
    expect(container.textContent).toContain(copy.patients.status.linkActive);
    expect(container.textContent).toContain(copy.patients.status.pmoYes);
    expect(container.textContent).not.toContain("/f/");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("rotate asks for confirmation, shows the new link once and refreshes the list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchSpy
      .mockResolvedValueOnce(jsonRes({ patients: [row()] }))
      .mockResolvedValueOnce(jsonRes({ familyLink: LINK }))
      .mockResolvedValueOnce(jsonRes({ patients: [row()] }));
    render(<PatientList />);
    fireEvent.click(await screen.findByRole("button", { name: copy.patients.actions.rotate }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(copy.patients.linkModal.warning);
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/nurse/patients/11111111-1111-4111-8111-111111111111/token");
    expect(fetchSpy.mock.calls[1][1].method).toBe("POST");

    fireEvent.click(screen.getByRole("button", { name: copy.patients.linkModal.close }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.textContent).not.toContain(LINK);
  });

  it("does nothing when the nurse cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fetchSpy.mockResolvedValueOnce(jsonRes({ patients: [row()] }));
    render(<PatientList />);
    fireEvent.click(await screen.findByRole("button", { name: copy.patients.actions.revoke }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("revoke calls DELETE and the list shows the 'Dicabut' status afterwards", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchSpy
      .mockResolvedValueOnce(jsonRes({ patients: [row()] }))
      .mockResolvedValueOnce(jsonRes({ ok: true }))
      .mockResolvedValueOnce(jsonRes({ patients: [row({ linkStatus: "revoked" })] }));
    const { container } = render(<PatientList />);
    fireEvent.click(await screen.findByRole("button", { name: copy.patients.actions.revoke }));

    await waitFor(() => expect(container.textContent).toContain(copy.patients.status.linkRevoked));
    expect(fetchSpy.mock.calls[1][1].method).toBe("DELETE");
    const revokeBtn = screen.getByRole("button", { name: copy.patients.actions.revoke }) as HTMLButtonElement;
    expect(revokeBtn.disabled).toBe(true);
  });
});

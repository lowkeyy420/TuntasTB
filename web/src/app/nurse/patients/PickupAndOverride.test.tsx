// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { copy } from "@/copy/nurse.id";
import { addDays } from "@/lib/risk/dates";
import { todayJakarta } from "@/lib/time";
import { OverrideDialog } from "./[id]/OverrideDialog";
import { PickupPanel, type PickupFields } from "./PickupPanel";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => jsonRes({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const today = () => todayJakarta();
const patient = (over: Partial<PickupFields> = {}): PickupFields => ({
  id: "pat-1",
  startDate: addDays(today(), -60),
  pickupId: "pick-1",
  nextPickupDue: addDays(today(), 3),
  pickupState: "upcoming",
  daysOverdue: 0,
  ...over,
});

describe("PickupPanel (pickup-planner 5.1, 5.2)", () => {
  it("shows the state in icon and word with the due date", () => {
    render(<PickupPanel patient={patient()} onChanged={() => undefined} />);
    expect(screen.getByText(copy.pickup.state.upcoming)).toBeTruthy();
    expect(screen.getByText(copy.pickup.inDays(3), { exact: false })).toBeTruthy();
  });

  it("a missed pickup says how many days overdue", () => {
    render(
      <PickupPanel
        patient={patient({ nextPickupDue: addDays(today(), -3), pickupState: "missed", daysOverdue: 3 })}
        onChanged={() => undefined}
      />,
    );
    expect(screen.getByText(copy.pickup.state.missed)).toBeTruthy();
    expect(screen.getByText(copy.pickup.overdueDays(3), { exact: false })).toBeTruthy();
  });

  it("'Sudah diambil' is one tap: it posts to the done route with no date and reloads the list", async () => {
    const onChanged = vi.fn();
    render(<PickupPanel patient={patient()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.markDone }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/nurse/patients/pat-1/pickups/pick-1/done", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  });

  it("reports a failed save and does not reload", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({}, 500));
    const onChanged = vi.fn();
    render(<PickupPanel patient={patient()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.markDone }));
    expect((await screen.findByRole("alert")).textContent).toBe(copy.pickup.failed);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("'Tanggal lain' refuses a future date in the form, before any request", async () => {
    render(<PickupPanel patient={patient()} onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.otherDate }));
    const input = screen.getByLabelText(copy.pickup.doneOnLabel) as HTMLInputElement;
    expect(input.max).toBe(today());
    fireEvent.change(input, { target: { value: addDays(today(), 1) } });
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.save }));
    expect((await screen.findByRole("alert")).textContent).toBe(copy.pickup.validation.doneRange);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("'Tanggal lain' with yesterday posts that date", async () => {
    const onChanged = vi.fn();
    render(<PickupPanel patient={patient()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.otherDate }));
    const yesterday = addDays(today(), -1);
    fireEvent.change(screen.getByLabelText(copy.pickup.doneOnLabel), { target: { value: yesterday } });
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.save }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ doneOn: yesterday }) });
  });

  it("the server's refusal of a date is shown in the form", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ error: "validation", fields: { doneOn: "Tanggal tidak valid dari server" } }, 400));
    render(<PickupPanel patient={patient()} onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.otherDate }));
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.save }));
    expect((await screen.findByRole("alert")).textContent).toBe("Tanggal tidak valid dari server");
  });

  it("'Ubah jadwal' patches the due date, and tells when the pickup is already closed", async () => {
    const onChanged = vi.fn();
    render(<PickupPanel patient={patient()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.reschedule }));
    const next = addDays(today(), 5);
    fireEvent.change(screen.getByLabelText(copy.pickup.dueDateLabel), { target: { value: next } });
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.save }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/nurse/patients/pat-1/pickups/pick-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ dueDate: next }) });

    fetchMock.mockResolvedValueOnce(jsonRes({ error: "closed" }, 409));
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.reschedule }));
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.save }));
    expect((await screen.findByRole("alert")).textContent).toBe(copy.pickup.closed);
  });

  it("can be cancelled and closed with Escape", () => {
    render(<PickupPanel patient={patient()} onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.reschedule }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.otherDate }));
    fireEvent.click(screen.getByRole("button", { name: copy.pickup.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a patient without a schedule says so and offers no button", () => {
    render(<PickupPanel patient={patient({ pickupId: null, nextPickupDue: null, pickupState: null })} onChanged={() => undefined} />);
    expect(screen.getByText(copy.pickup.none)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.pickup.markDone })).toBeNull();
  });
});

describe("OverrideDialog (nurse-queue 5.6)", () => {
  const t = copy.timeline.override;

  it("keeps the save button disabled until the reason has 10 characters, and counts them", () => {
    render(<OverrideDialog checkinId="c1" current="YELLOW" onClose={() => undefined} onDone={() => undefined} />);
    const save = screen.getByRole("button", { name: t.submit }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const note = screen.getByLabelText(t.noteLabel);
    fireEvent.change(note, { target: { value: "sembilan!!" } }); // 10 characters
    expect(save.disabled).toBe(false);
    fireEvent.change(note, { target: { value: "   pendek   " } }); // 6 after trimming
    expect(save.disabled).toBe(true);
    expect(screen.getByText(t.count(6, 10))).toBeTruthy();
  });

  it("offers the other two levels, RED first when it is possible, and posts level and note", async () => {
    const onDone = vi.fn();
    render(<OverrideDialog checkinId="c1" current="YELLOW" onClose={() => undefined} onDone={onDone} />);
    const options = Array.from(screen.getByLabelText(t.levelLabel).querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual([copy.triageShort.GREEN, copy.triageShort.RED]);
    expect((screen.getByLabelText(t.levelLabel) as HTMLSelectElement).value).toBe("RED");
    fireEvent.change(screen.getByLabelText(t.noteLabel), { target: { value: "Keluarga bilang kulit mulai kuning" } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/nurse/checkins/c1/override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "RED", note: "Keluarga bilang kulit mulai kuning" }),
    });
  });

  it("from RED it offers GREEN and YELLOW, and a server error stays in the dialog", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ error: "validation", fields: { note: "Alasan minimal 10 karakter" } }, 400));
    const onDone = vi.fn();
    render(<OverrideDialog checkinId="c1" current="RED" onClose={() => undefined} onDone={onDone} />);
    expect(Array.from(screen.getByLabelText(t.levelLabel).querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      copy.triageShort.GREEN,
      copy.triageShort.YELLOW,
    ]);
    fireEvent.change(screen.getByLabelText(t.noteLabel), { target: { value: "Sudah ditelepon, kulit tidak kuning" } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    expect((await screen.findByRole("alert")).textContent).toBe("Alasan minimal 10 karakter");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a network failure shows the generic message; cancel closes", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const onClose = vi.fn();
    render(<OverrideDialog checkinId="c1" current={null} onClose={onClose} onDone={() => undefined} />);
    fireEvent.change(screen.getByLabelText(t.noteLabel), { target: { value: "alasan yang cukup panjang" } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    expect((await screen.findByRole("alert")).textContent).toBe(t.failed);
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(onClose).toHaveBeenCalled();
  });
});

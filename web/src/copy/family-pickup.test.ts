import { describe, expect, it } from "vitest";
import { copy } from "@/copy/family.id";

/**
 * Pickup wording on family screens (pickup-planner 4.2): neutral, and never an
 * instruction about doses, including what to do when medicine has run out.
 */
const FORBIDDEN = /\b(TB|TBC|tuberkulosis|TuntasTB)\b/i;
const REASSURANCE = /\baman\b/i;
const DOSING =
  /\b(\d+\s*mg|dosis|tablet|kapsul|pil|kurangi|tambah(kan)?|gandakan|lewati|ganti obat|minum (lebih|dobel|dua kali)|sisa obat|habis)\b/i;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") strings((value as (...a: unknown[]) => unknown)(3, "Contoh"), out);
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

describe("family pickup copy", () => {
  const all = strings(copy.pickup);

  it("has the banner texts of the design", () => {
    expect(copy.pickup.inDays(5)).toBe("Ambil obat 5 hari lagi");
    expect(copy.pickup.tomorrow).toBe("Ambil obat besok");
    expect(copy.pickup.today).toBe("Ambil obat hari ini");
    expect(copy.pickup.overdue).toBe("Jadwal ambil obat sudah lewat");
    expect(copy.pickup.overdueDays(2)).toBe("Sudah lewat 2 hari");
    expect(all.length).toBeGreaterThan(10);
  });

  it("names neither the illness nor the medicine, and never says 'aman'", () => {
    expect(all.filter((s) => FORBIDDEN.test(s) || REASSURANCE.test(s))).toEqual([]);
  });

  it("gives no instruction about doses or what to do with missing medicine", () => {
    expect(all.filter((s) => DOSING.test(s))).toEqual([]);
    for (const probe of ["Kurangi obat", "minum 2 tablet", "sisa obat dihemat", "obat habis, tambah dosis"]) {
      expect(DOSING.test(probe), probe).toBe(true);
    }
  });

  it("the overdue banner asks the family to contact the Puskesmas", () => {
    expect(copy.pickup.overdueBody).toMatch(/Puskesmas/);
  });
});

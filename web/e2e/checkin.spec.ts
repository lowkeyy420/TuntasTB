import { expect, test, type Page } from "@playwright/test";
import { createPatient, deletePatient, startProxy, storedFor, type TestPatient } from "./support";

// Wording from src/copy/family.id.ts (kept literal here: these tests read the page as a person would).
const QUEUED = "Belum terkirim, akan dikirim saat ada sinyal";
const SENT = "Terkirim";
const RED_NOTICE = "Laporan ini belum sampai ke perawat.";

let patient: TestPatient;
let proxy: Awaited<ReturnType<typeof startProxy>>;

test.beforeAll(async () => {
  proxy = await startProxy();
});

test.afterAll(async () => {
  await proxy.close();
});

test.beforeEach(async ({ request }) => {
  proxy.setCut(false);
  patient = await createPatient(request);
});

test.afterEach(async ({ request }) => {
  await deletePatient(request, patient);
});

const open = async (page: Page) => {
  await page.goto(`${proxy.origin}/f/${patient.token}`);
  await expect(page.getByRole("checkbox").first()).toBeVisible();
};

/** Taps are counted as pointer presses, the way a thumb would count them. Calling it again resets the count. */
async function countTaps(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __taps: number; __tapsOn?: boolean };
    w.__taps = 0;
    if (w.__tapsOn) return;
    w.__tapsOn = true;
    document.addEventListener("pointerdown", () => w.__taps++, true);
  });
  return () => page.evaluate(() => (window as unknown as { __taps: number }).__taps);
}

async function rememberedOffline(page: Page) {
  // The worker keeps the page and its build files after the first visit.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          return Boolean(await caches.match(location.href, { ignoreSearch: true }));
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

test("4.3: at 320px there is no horizontal scroll, text is 18px or more and every control is 48px or more", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page);

  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noOverflow).toBe(true);

  const controls = page.locator(
    'main label:has(input[type="radio"]), main label:has(input[type="checkbox"]), main button, main textarea, main a[href]',
  );
  const count = await controls.count();
  expect(count).toBeGreaterThan(5);
  const small: string[] = [];
  for (let i = 0; i < count; i++) {
    const box = await controls.nth(i).boundingBox();
    const label = ((await controls.nth(i).textContent()) ?? "").trim().slice(0, 30);
    if (!box || box.height < 47.5 || box.width < 47.5) small.push(`${label}: ${box?.width}x${box?.height}`);
    if (box && box.x + box.width > 320.5) small.push(`${label}: overflows right edge`);
  }
  expect(small).toEqual([]);

  const smallText = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("main *")) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
      if (!own) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 18) out.push(`${(el.textContent ?? "").trim().slice(0, 30)}: ${size}px`);
    }
    return out;
  });
  expect(smallText).toEqual([]);
});

test("4.4: dose + one symptom is three taps, dose only is two", async ({ page }) => {
  await open(page);
  const taps = await countTaps(page);

  await page.getByText("Sudah", { exact: true }).click();
  await page.getByText("Mual ringan setelah minum obat").click();
  const first = page.waitForResponse((r) => r.url().endsWith("/api/checkins") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Kirim" }).click();
  expect((await first).status()).toBe(200);
  expect(await taps()).toBe(3);
  await expect(page.getByText("Lanjutkan")).toBeVisible();

  await page.getByRole("button", { name: "Selesai" }).click();
  const again = await countTaps(page);
  await page.getByText("Sudah", { exact: true }).click();
  const second = page.waitForResponse((r) => r.url().endsWith("/api/checkins") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Kirim" }).click();
  expect((await second).status()).toBe(200);
  expect(await again()).toBe(2);
});

test("6.5: offline RED shows go-today text, then goes online and the server reply replaces it; one check-in stored", async ({
  page,
  context,
}) => {
  await open(page);
  await rememberedOffline(page);

  // No signal: the page's own switch and the proxy in front of the stack (which service workers use).
  proxy.setCut(true);
  await context.setOffline(true);

  await page.getByText("Sudah", { exact: true }).click();
  await page.getByText("Mata atau kulit kuning").click();
  await page.getByRole("button", { name: "Kirim" }).click();

  await expect(page.getByText(QUEUED)).toBeVisible();
  await expect(page.getByText("Segera ke Puskesmas atau IGD hari ini.")).toBeVisible();
  await expect(page.getByText(RED_NOTICE)).toBeVisible();
  await expect(page.getByText("Telepon Puskesmas: 021-5550123.")).toBeVisible();
  expect((await storedFor(patient.id)).checkins).toHaveLength(0);

  // The connection returns.
  proxy.setCut(false);
  await context.setOffline(false);

  await expect(page.getByText(SENT, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Perawat sudah diberi tahu.", { exact: false })).toBeVisible();
  await expect(page.getByText(RED_NOTICE)).toHaveCount(0);

  const stored = await storedFor(patient.id);
  expect(stored.checkins).toHaveLength(1);
  expect(stored.checkins[0].triage_level).toBe("RED");
  expect(stored.alerts).toHaveLength(1);
});

test("6.1: a link opened online once opens again with no signal, and a check-in survives a reload", async ({
  page,
  context,
}) => {
  await open(page);
  await rememberedOffline(page);

  proxy.setCut(true);
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText("Bagaimana kabar hari ini?")).toBeVisible();
  await expect(page.getByText("Obat hari ini sudah diminum?")).toBeVisible();
  await expect(page.getByRole("checkbox").first()).toBeVisible();

  await page.getByText("Belum", { exact: true }).click();
  await page.getByRole("button", { name: "Kirim" }).click();
  await expect(page.getByText(QUEUED)).toBeVisible();

  // Closed and reopened before the connection returns: still queued.
  await page.reload();
  await expect(page.getByText("Ada 1 catatan yang belum terkirim.")).toBeVisible();

  proxy.setCut(false);
  await context.setOffline(false);
  await expect(page.getByText("Ada 1 catatan yang belum terkirim.")).toHaveCount(0, { timeout: 20_000 });
  const stored = await storedFor(patient.id);
  expect(stored.checkins).toHaveLength(1);
  expect(stored.alerts).toHaveLength(0);
});

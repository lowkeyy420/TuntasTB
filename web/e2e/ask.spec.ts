import { expect, test, type Page } from "@playwright/test";
import { createPatient, deletePatient, startProxy, type TestPatient } from "./support";

/**
 * Browser checks of the "Ada pertanyaan?" screen (guideline-qa 4.2, 4.3).
 * They use only questions the app answers without calling Langflow (a warning
 * sign, a dosing question), so they do not depend on the model or its quota.
 */

// Wording from src/copy/family.id.ts, kept literal: these tests read the page as a person would.
const ABSTAIN = "Saya belum bisa menjawab ini, tanyakan ke perawat";
const URGENT = "Keluhan ini perlu diperiksa hari ini. Segera ke Puskesmas atau IGD, lalu kirim laporan harian supaya perawat tahu.";
const OFFLINE = "Tidak ada sinyal, jadi pertanyaan belum bisa dikirim. Kalau mendesak, telepon Puskesmas.";
const CONTACT = /Puskesmas .+, telepon \S+\.$/;

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

const field = (page: Page) => page.getByLabel("Pertanyaan Anda");

async function openAsk(page: Page) {
  await page.goto(`${proxy.origin}/f/${patient.token}`);
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  await page.getByRole("link", { name: "Tanya", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/f/${patient.token}/tanya$`));
  await expect(field(page)).toBeVisible();
}

async function ask(page: Page, question: string) {
  await field(page).fill(question);
  await page.getByRole("button", { name: "Tanya", exact: true }).click();
}

test("4.2: the check-in screen links to the question screen; an empty question sends nothing", async ({ page }) => {
  await openAsk(page);
  let sent = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/ask")) sent++;
  });
  await page.getByRole("button", { name: "Tanya", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Tulis dulu pertanyaan Anda.");
  expect(sent).toBe(0);
});

test("4.2: a warning sign in the question shows the go-today text, the number last, and a way to send the check-in", async ({
  page,
}) => {
  await openAsk(page);
  await ask(page, "matanya kuning itu normal?");
  const alert = page.locator("main").getByRole("alert");
  await expect(alert).toContainText(URGENT);
  const lines = ((await alert.innerText()) ?? "").trim().split("\n").map((l) => l.trim()).filter(Boolean);
  expect(lines[lines.length - 1]).toMatch(CONTACT);
  await expect(page.getByRole("link", { name: "Telepon Puskesmas" })).toHaveAttribute("href", /^tel:/);
  await page.getByRole("link", { name: "Kirim laporan harian" }).click();
  await expect(page).toHaveURL(new RegExp(`/f/${patient.token}$`));
});

test("4.2: a dosing question gets the exact abstain sentence followed by the number", async ({ page }) => {
  await openAsk(page);
  await ask(page, "boleh dikurangi jadi 2 tablet?");
  const status = page.locator("main").getByRole("status");
  await expect(status).toContainText(ABSTAIN);
  const text = (await status.innerText()).trim();
  expect(text.split("\n")[0].trim()).toBe(ABSTAIN);
  expect(text.split("\n").pop()!.trim()).toMatch(CONTACT);
  await page.getByRole("button", { name: "Tanya lagi" }).click();
  await expect(field(page)).toHaveValue("");
});

test("4.3: without signal the screen opens from the device and shows the cached Puskesmas number", async ({ page }) => {
  await openAsk(page);
  // The worker keeps the page after the first visit.
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

  proxy.setCut(true);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await ask(page, "kenapa kencingnya jadi merah?");
  const status = page.locator("main").getByRole("status");
  await expect(status).toContainText(OFFLINE);
  expect((await status.innerText()).trim().split("\n").pop()!.trim()).toMatch(CONTACT);
  await expect(page.getByRole("link", { name: "Telepon Puskesmas" })).toHaveAttribute("href", /^tel:/);
});

test("4.2: at 320px the screen has no horizontal scroll and every control is 48px or more", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openAsk(page);
  await ask(page, "boleh dikurangi jadi 2 tablet?");
  await expect(page.locator("main").getByRole("status")).toContainText(ABSTAIN);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const controls = page.locator("main button, main a[href]");
  const small: string[] = [];
  for (let i = 0; i < (await controls.count()); i++) {
    const box = await controls.nth(i).boundingBox();
    if (!box || box.height < 47.5 || box.width < 47.5) small.push(`${await controls.nth(i).textContent()}: ${box?.width}x${box?.height}`);
  }
  expect(small).toEqual([]);
});

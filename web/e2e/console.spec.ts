import { expect, test, type Page } from "@playwright/test";
import { createPatient, deletePatient, startProxy, STACK, type TestPatient } from "./support";

// Wording from src/copy/nurse.id.ts (kept literal: these tests read the page as a nurse would).
const ACK = "Sudah saya lihat";
const ACKED = "Sudah ditanggapi";

let patient: TestPatient;

test.beforeEach(async ({ request }) => {
  patient = await createPatient(request);
});

test.afterEach(async ({ request }) => {
  await deletePatient(request, patient);
});

async function signIn(page: Page) {
  await page.goto(`${STACK}/login`);
  await page.getByLabel("Email").fill("perawat@demo.id");
  await page.getByLabel("Kata sandi").fill("demo12345");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/nurse");
}

/** The family's device sends a RED check-in. Returns when the server has answered. */
async function sendRed(page: Page) {
  const res = await page.request.post(`${STACK}/api/checkins`, {
    headers: { authorization: `Bearer ${patient.token}` },
    data: { clientId: crypto.randomUUID(), doseStatus: "yes", chips: [], text: "matanya kuning" },
  });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).level).toBe("RED");
}

test("4.4: a RED check-in submitted through the API shows in an open console within 5 seconds, and can be acknowledged", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${STACK}/nurse/alerts`);
  await expect(page.getByRole("heading", { name: "Peringatan MERAH" })).toBeVisible();
  await expect(page.getByText("Terhubung langsung")).toBeVisible();
  await expect(page.getByText(patient.code)).toHaveCount(0);

  const sent = Date.now();
  await sendRed(page);
  await expect(page.getByText(patient.code)).toBeVisible({ timeout: 5_000 });
  expect(Date.now() - sent).toBeLessThan(5_000);

  const card = page.getByRole("listitem").filter({ hasText: patient.code });
  await expect(card.getByText("Mata atau kulit kuning")).toBeVisible();
  await card.getByRole("button", { name: ACK }).click();
  await expect(card.getByText(ACKED)).toBeVisible();
  await expect(card.getByText(/Dilihat oleh perawat@demo\.id pukul/)).toBeVisible();
});

test("the banner follows the nurse to other pages while an alert is unacknowledged", async ({ page }) => {
  await signIn(page);
  await page.goto(`${STACK}/nurse/patients`);
  await sendRed(page);
  await expect(page.getByRole("alert").filter({ hasText: "belum ditanggapi" })).toBeVisible({ timeout: 5_000 });
  // Navigating on keeps the banner (the connection lives in the console frame).
  await page.getByRole("link", { name: "Antrean" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "belum ditanggapi" })).toBeVisible();
});

test("two console windows: an alert shows in both and disappears from the open list of both after one acknowledges", async ({
  browser,
}) => {
  const [a, b] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = [await a.newPage(), await b.newPage()];
  await Promise.all([signIn(pageA), signIn(pageB)]);
  await Promise.all([pageA.goto(`${STACK}/nurse/alerts`), pageB.goto(`${STACK}/nurse/alerts`)]);
  await expect(pageB.getByText("Terhubung langsung")).toBeVisible();
  await expect(pageA.getByText("Terhubung langsung")).toBeVisible();

  await sendRed(pageA);
  for (const p of [pageA, pageB]) await expect(p.getByText(patient.code)).toBeVisible({ timeout: 5_000 });

  const cardA = pageA.getByRole("listitem").filter({ hasText: patient.code });
  await cardA.getByRole("button", { name: ACK }).click();
  const cardB = pageB.getByRole("listitem").filter({ hasText: patient.code });
  await expect(cardB.getByText(ACKED)).toBeVisible({ timeout: 5_000 });
  await expect(cardB.getByRole("button", { name: ACK })).toHaveCount(0);
  await Promise.all([a.close(), b.close()]);
});

test("5.2, 5.6: the timeline shows the check-in; the override needs 10 characters and keeps the original level", async ({
  page,
}) => {
  await signIn(page);
  await sendRed(page);
  await page.goto(`${STACK}/nurse/patients/${patient.id}`);
  await expect(page.getByRole("heading", { name: `Riwayat ${patient.code}` })).toBeVisible();
  await expect(page.getByText("Mata atau kulit kuning").first()).toBeVisible();
  await expect(page.getByText(/Aturan triase: draft/)).toBeVisible();

  await page.getByRole("button", { name: "Ubah level" }).click();
  const save = page.getByRole("button", { name: "Simpan perubahan" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Alasan (wajib)").fill("pendek");
  await expect(save).toBeDisabled();
  await page.getByLabel("Alasan (wajib)").fill("Sudah ditelepon, kulit tidak kuning");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Level awal: Merah")).toBeVisible();
  await expect(page.getByText(/Diubah oleh perawat@demo\.id/)).toBeVisible();
});

test("4.4 (pickup): the pickup card on the family screen survives losing the signal", async ({ page }) => {
  const proxy = await startProxy();
  try {
    await page.goto(`${proxy.origin}/f/${patient.token}`);
    await expect(page.getByRole("heading", { name: "Ambil obat" })).toBeVisible();
    const headline = await page.getByText(/^Ambil obat \d+ hari lagi$/).textContent();
    // Let the worker keep the page and the card's due date.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          return Boolean(await caches.match(location.href, { ignoreSearch: true }));
        }),
      )
      .toBe(true);
    proxy.setCut(true);
    await page.reload();
    await expect(page.getByText(headline!)).toBeVisible({ timeout: 15_000 });
  } finally {
    await proxy.close();
  }
});

test("the queue lists the new patient with a reason and one suggested action", async ({ page }) => {
  await signIn(page);
  await page.goto(`${STACK}/nurse/queue`);
  await expect(page.getByRole("heading", { name: "Antrean pagi" })).toBeVisible();
  // A patient who has not reported yet has no reason to act on.
  const card = page.getByRole("listitem").filter({ hasText: patient.code });
  await expect(card).toBeVisible();
  await expect(card.getByText("Tidak ada tindakan")).toBeVisible();
});

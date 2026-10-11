import { expect, request as pwRequest, test, type Page } from "@playwright/test";
import { createPatient, deletePatient, STACK, type TestPatient } from "./support";

/**
 * Small screens, zoom and keyboard focus over the main screens
 * (add-design-system 6.4). For each of three viewports the test opens a
 * screen, checks that the page does not scroll sideways and that no element
 * pokes out of the viewport, then presses Tab through the page and checks that
 * every control that takes focus shows a focus ring at least 3px thick.
 *
 * "200% zoom on a 1280px display" lays the page out in 640 CSS pixels at twice
 * the pixel density, so that is what the third viewport sets.
 */

const VIEWPORTS = [
  { name: "320px wide", viewport: { width: 320, height: 640 }, deviceScaleFactor: 1 },
  { name: "360 x 640", viewport: { width: 360, height: 640 }, deviceScaleFactor: 1 },
  { name: "200% zoom (640px layout, 2x density)", viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 },
] as const;

let consented: TestPatient;
let noConsent: TestPatient;

test.beforeAll(async () => {
  const api = await pwRequest.newContext();
  consented = await createPatient(api);
  noConsent = await createPatient(api, false);
  await api.dispose();
});

test.afterAll(async () => {
  const api = await pwRequest.newContext();
  await api.post(`${STACK}/api/auth/login`, { data: { email: "perawat@demo.id", password: "demo12345" } });
  await deletePatient(api, consented);
  await deletePatient(api, noConsent);
  await api.dispose();
});

async function signIn(page: Page) {
  const res = await page.request.post(`${STACK}/api/auth/login`, {
    data: { email: "perawat@demo.id", password: "demo12345" },
  });
  expect(res.ok()).toBeTruthy();
}

/** The page must not scroll sideways, and nothing may stick out past the right edge. */
async function expectNoHorizontalScroll(page: Page) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const width = doc.clientWidth;
    const outside: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Content inside its own scrolling box (a wide table, a link box) may extend past the edge.
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") {
          clipped = true;
          break;
        }
      }
      if (!clipped && r.right > width + 1) {
        outside.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: width, outside: outside.slice(0, 5) };
  });
  expect(result.scrollWidth, `page scrolls sideways (${JSON.stringify(result.outside)})`).toBeLessThanOrEqual(
    result.clientWidth,
  );
  expect(result.outside, "elements outside the viewport").toEqual([]);
}

/** Presses Tab through the page; every focused control (or its custom choice wrapper) must show a 3px ring. */
async function expectVisibleFocusOnTab(page: Page, { allowNone = false } = {}) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
  const seen = new Set<string>();
  const problems: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // A preview frame takes focus as a whole; its contents are checked at their own address.
      if (el.tagName === "IFRAME") return { key: `iframe@${Math.round(el.getBoundingClientRect().y)}`, label: "iframe", ring: 99 };
      const ringOf = (node: Element | null) => {
        if (!node) return 0;
        const cs = getComputedStyle(node);
        if (cs.outlineStyle === "none" || cs.outlineStyle === "hidden") return 0;
        if (cs.outlineColor === "rgba(0, 0, 0, 0)" || cs.outlineColor === "transparent") return 0;
        return parseFloat(cs.outlineWidth);
      };
      // The radio/checkbox is hidden inside its card or chip: the whole choice shows the ring.
      const ring = Math.max(ringOf(el), ringOf(el.closest(".choice")), ringOf(el.closest("label")));
      const r = el.closest(".choice")?.getBoundingClientRect() ?? el.getBoundingClientRect();
      const label = `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("name") ?? "").trim().slice(0, 30)}`;
      return { key: `${label}@${Math.round(r.x)},${Math.round(r.y + window.scrollY)}`, label, ring };
    });
    if (!info) break; // focus left the page: the cycle is complete
    if (seen.has(info.key)) break;
    seen.add(info.key);
    if (info.ring < 3) problems.push(`${info.label}: ring ${info.ring}px`);
  }
  if (!allowNone) expect(seen.size, "Tab reached no control").toBeGreaterThan(0);
  expect(problems, "controls without a visible 3px focus ring").toEqual([]);
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { ...vp.viewport }, deviceScaleFactor: vp.deviceScaleFactor });

    async function check(page: Page, path: string, ready: () => Promise<unknown>, opts?: { allowNone?: boolean }) {
      await page.goto(`${STACK}${path}`);
      await ready();
      await expectNoHorizontalScroll(page);
      await expectVisibleFocusOnTab(page, opts);
    }

    test("family: check-in screen and the link to questions", async ({ page }) => {
      await check(page, `/f/${consented.token}`, () => expect(page.getByRole("checkbox").first()).toBeVisible());
      await expect(page.getByRole("link", { name: "Tanya", exact: true })).toBeVisible();
    });

    test("family: consent screen", async ({ page }) => {
      await check(page, `/f/${noConsent.token}`, () => expect(page.getByRole("button", { name: "Saya setuju" })).toBeVisible());
    });

    test("family: question screen, form and abstain answer", async ({ page }) => {
      await check(page, `/f/${consented.token}/tanya`, () => expect(page.getByLabel("Pertanyaan Anda")).toBeVisible());
      await page.getByLabel("Pertanyaan Anda").fill("boleh dikurangi jadi 2 tablet?");
      await page.getByRole("button", { name: "Tanya", exact: true }).click();
      await expect(page.locator("main").getByRole("status")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectVisibleFocusOnTab(page);
    });

    test("family: question screen, go-today answer", async ({ page }) => {
      await page.goto(`${STACK}/f/${consented.token}/tanya`);
      await page.getByLabel("Pertanyaan Anda").fill("matanya kuning itu normal?");
      await page.getByRole("button", { name: "Tanya", exact: true }).click();
      await expect(page.locator("main").getByRole("alert")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectVisibleFocusOnTab(page);
    });

    test("family: reply screen after a check-in", async ({ page }) => {
      await page.goto(`${STACK}/f/${consented.token}`);
      await page.getByText("Sudah", { exact: true }).click();
      await page.getByRole("button", { name: "Kirim" }).click();
      await expect(page.getByRole("button", { name: "Selesai" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectVisibleFocusOnTab(page);
    });

    test("family: invalid link and landing page", async ({ page }) => {
      // The invalid-link page has no control to focus: only the layout is checked.
      await check(page, `/f/${"x".repeat(43)}`, () => expect(page.getByRole("heading", { level: 1 })).toBeVisible(), { allowNone: true });
      await check(page, "/", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
    });

    test("login page", async ({ page }) => {
      await check(page, "/login", () => expect(page.getByLabel("Email")).toBeVisible());
    });

    for (const [name, path] of [
      ["queue", "/nurse/queue"],
      ["alerts", "/nurse/alerts"],
      ["patient list", "/nurse/patients"],
      ["new patient form", "/nurse/patients/new"],
    ] as const) {
      test(`nurse: ${name}`, async ({ page }) => {
        await signIn(page);
        await check(page, path, () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
      });
    }

    test("nurse: patient timeline", async ({ page }) => {
      await signIn(page);
      await check(page, `/nurse/patients/${consented.id}`, () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
    });

    test("design preview and every mockup", async ({ page }) => {
      await check(page, "/design", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
      for (const slug of ["checkin", "reply-green", "reply-yellow", "reply-red", "pickup", "ask", "queue", "alerts"]) {
        await check(page, `/design/screens/${slug}`, () => expect(page.locator("main, body").first()).toBeVisible());
      }
    });
  });
}

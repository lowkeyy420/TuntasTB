import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrastRatio, luminance } from "./contrast";
import { colors, pairs, thresholds, typeScale, type ColorPair } from "./tokens";

const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

/** `--color-name: #hex;` declarations in the stylesheet. */
function cssColors(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/** `--text-name: Nrem;` declarations in the stylesheet. */
function cssTextSizes(source: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of source.matchAll(/--text-([a-z0-9]+):\s*([\d.]+)rem\s*;/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

function failing(list: ColorPair[]): string[] {
  return list
    .map((p) => ({ p, ratio: contrastRatio(colors[p.fg], colors[p.bg]) }))
    .filter(({ p, ratio }) => ratio < thresholds[p.role])
    .map(
      ({ p, ratio }) =>
        `${p.fg} on ${p.bg} (${p.role}): ${ratio.toFixed(2)} < ${thresholds[p.role]}`,
    );
}

describe("contrast maths", () => {
  it("gives 21:1 for black on white and 1:1 for equal colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#0b5a54", "#0b5a54")).toBe(1);
  });

  it("matches a known mid pair (#767676 on white is 4.54:1)", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("rejects anything that is not #rrggbb", () => {
    expect(() => luminance("teal")).toThrow();
    expect(() => luminance("#fff")).toThrow();
  });
});

describe("colour tokens", () => {
  it("are identical in globals.css and tokens.ts", () => {
    expect(cssColors(css)).toEqual(colors);
  });

  it("every declared pair meets its WCAG threshold", () => {
    expect(failing(pairs)).toEqual([]);
  });

  it("body text reaches 7:1 on the page and on cards", () => {
    expect(contrastRatio(colors.ink, colors.canvas)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(colors.ink, colors.surface)).toBeGreaterThanOrEqual(7);
  });

  it("input borders and the focus ring reach 3:1 on the page and on cards", () => {
    for (const fg of ["line-strong", "focus"] as const) {
      for (const bg of ["canvas", "surface"] as const) {
        expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("each triage level has readable text on its own background and under white", () => {
    for (const level of ["green", "yellow", "red"] as const) {
      const ink = colors[`triage-${level}-ink`];
      const bg = colors[`triage-${level}-bg`];
      const solid = colors[`triage-${level}-solid`];
      expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors["on-solid"], solid)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(solid, colors.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("the check itself catches a weak pair (guards against false negatives)", () => {
    const weak: ColorPair = { fg: "line", bg: "surface", role: "text", use: "probe" };
    expect(failing([weak])).toHaveLength(1);
  });
});

describe("single light theme", () => {
  it("has no rule conditional on the colour-scheme preference", () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
  });

  it("declares the page light-only", () => {
    expect(css).toMatch(/color-scheme:\s*light\s*;/);
  });

  it("switches off Tailwind's default palette so only tokens can be used", () => {
    expect(css).toMatch(/--color-\*:\s*initial\s*;/);
  });
});

describe("type scale", () => {
  const sizes = cssTextSizes(css);

  it("has no step below 16px", () => {
    expect(Object.keys(sizes).length).toBeGreaterThan(0);
    for (const [name, rem] of Object.entries(sizes)) {
      expect(rem * 16, `text-${name}`).toBeGreaterThanOrEqual(16);
    }
  });

  it("sets body text to at least 18px with a line height of at least 1.5", () => {
    expect(sizes.base * 16).toBeGreaterThanOrEqual(18);
    const lh = /--text-base--line-height:\s*([\d.]+)\s*;/.exec(css);
    expect(Number(lh?.[1])).toBeGreaterThanOrEqual(1.5);
    expect(css).toMatch(/font-size:\s*var\(--text-base\)/);
  });

  it("matches the scale shown on the preview page", () => {
    for (const step of typeScale) {
      expect(sizes[step.token.replace("text-", "")], step.token).toBe(step.rem);
    }
  });
});

describe("motion and focus", () => {
  it("removes motion when reduced motion is requested", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("draws a focus ring at least 3px thick", () => {
    const m = /:focus-visible[^{]*\{\s*outline:\s*(\d+)px solid var\(--color-focus\)/.exec(css);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(3);
  });
});

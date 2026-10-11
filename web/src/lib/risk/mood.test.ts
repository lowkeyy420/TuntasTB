import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadRulesFromDir } from "../triage/loadFiles";
import { detectMoodFlags, mergeMoodFlags } from "./mood";

const rules = loadRulesFromDir(fileURLToPath(new URL("../../../../rules", import.meta.url)));
const none = { stopIntent: false, stigma: false };

describe("detectMoodFlags", () => {
  it.each([
    ["sudah sembuh", { stopIntent: true, stigma: false }],
    ["mau berhenti", { stopIntent: true, stigma: false }],
    ["capek minum obat", { stopIntent: true, stigma: false }],
    ["bosan minum obat", { stopIntent: true, stigma: false }],
    ["malu", { stopIntent: false, stigma: true }],
    ["takut ketahuan", { stopIntent: false, stigma: true }],
    ["Dimas bilang sudah sembuh, mau berhenti", { stopIntent: true, stigma: false }],
    ["malu, takut ketahuan tetangga", { stopIntent: false, stigma: true }],
    ["MAUUU berhenti dong", { stopIntent: true, stigma: false }],
    ["kencingnya merah", none],
    ["", none],
  ])("%s", (text, expected) => {
    expect(detectMoodFlags(text, rules)).toEqual(expected);
  });

  it("detects both at once", () => {
    expect(detectMoodFlags("malu, jadi mau berhenti", rules)).toEqual({ stopIntent: true, stigma: true });
  });

  it("matches on token boundaries (does not fire inside other words)", () => {
    expect(detectMoodFlags("kemaluan", rules)).toEqual(none);
  });
});

describe("mergeMoodFlags", () => {
  it("extraction can add a flag", () => {
    expect(mergeMoodFlags(none, ["stop_intent"])).toEqual({ stopIntent: true, stigma: false });
    expect(mergeMoodFlags(none, ["stigma"])).toEqual({ stopIntent: false, stigma: true });
    expect(mergeMoodFlags(none, ["stop_intent", "stigma"])).toEqual({ stopIntent: true, stigma: true });
  });

  it("extraction cannot remove a flag found by the lexicon", () => {
    const found = { stopIntent: true, stigma: true };
    expect(mergeMoodFlags(found, [])).toEqual(found);
    expect(mergeMoodFlags(found, ["boredom"])).toEqual(found);
  });

  it("boredom alone adds nothing", () => {
    expect(mergeMoodFlags(none, ["boredom"])).toEqual(none);
  });

  it("boredom with a lexicon stop-intent phrase is stop intent via the lexicon", () => {
    const detected = detectMoodFlags("bosan minum obat", rules);
    expect(mergeMoodFlags(detected, ["boredom"]).stopIntent).toBe(true);
  });
});

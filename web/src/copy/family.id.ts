/**
 * Family-facing copy, Bahasa Indonesia.
 *
 * NEUTRAL WORDING RULE: nothing a bystander can see may reveal the illness.
 * These strings MUST NOT contain "TB", "TBC", "tuberkulosis" or "TuntasTB".
 * The family area is always titled "Pengingat Harian". An automated test
 * (family-wording.test.ts) enforces this.
 */
export const copy = {
  appName: "Pengingat Harian",
  shortName: "Pengingat",
  description: "Pengingat harian dan catatan singkat untuk keluarga.",
  home: {
    title: "Pengingat Harian",
    greeting: "Selamat datang",
    todayPrompt: "Bagaimana kabar hari ini?",
    hintNoPersonalData: "Jangan tulis nama atau alamat pada catatan.",
  },
  checkin: {
    submit: "Kirim catatan hari ini",
    thanks: "Terima kasih, catatan sudah tersimpan.",
  },
} as const;

export type FamilyCopy = typeof copy;

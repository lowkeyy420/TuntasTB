/**
 * Colour tokens, mirrored from the `@theme` block in src/app/globals.css, and
 * the pairs that are allowed to appear together. tokens.test.ts fails when
 * this file and the stylesheet disagree or when a pair is not readable.
 */
export const colors = {
  canvas: "#f3f6f5",
  surface: "#ffffff",
  sunken: "#e8eeec",
  ink: "#0f1f1d",
  "ink-muted": "#3b4b48",
  line: "#c9d3d0",
  "line-strong": "#5f706c",
  primary: "#0b5a54",
  "primary-strong": "#084540",
  "primary-soft": "#d9efeb",
  "on-primary-soft": "#083f3a",
  "on-solid": "#ffffff",
  focus: "#1a4fd6",
  scrim: "#0f1f1d",
  "triage-green-bg": "#dff3e4",
  "triage-green-ink": "#0d4a24",
  "triage-green-solid": "#17703a",
  "triage-yellow-bg": "#fcefc0",
  "triage-yellow-ink": "#553800",
  "triage-yellow-solid": "#8a5a00",
  "triage-red-bg": "#fde3df",
  "triage-red-ink": "#7a1512",
  "triage-red-solid": "#b3261e",
  "triage-red-strong": "#8f1d17",
  "info-bg": "#dfeafb",
  "info-ink": "#12366e",
} as const;

export type ColorToken = keyof typeof colors;

/** Minimum WCAG contrast ratio per role. */
export const thresholds = {
  /** Running text. AA asks for 4.5; this system holds body text to AAA. */
  body: 7,
  /** Labels, helper text, button and badge text. */
  text: 4.5,
  /** Borders of controls, icons that carry meaning, the focus ring. */
  ui: 3,
} as const;

export type PairRole = keyof typeof thresholds;

export interface ColorPair {
  fg: ColorToken;
  bg: ColorToken;
  role: PairRole;
  /** Where the pair is used. Shown on the design preview page. */
  use: string;
}

export const pairs: ColorPair[] = [
  { fg: "ink", bg: "canvas", role: "body", use: "Teks utama di halaman" },
  { fg: "ink", bg: "surface", role: "body", use: "Teks utama di kartu" },
  { fg: "ink", bg: "sunken", role: "body", use: "Teks di bidang redup" },
  { fg: "ink-muted", bg: "canvas", role: "body", use: "Teks bantuan di halaman" },
  { fg: "ink-muted", bg: "surface", role: "body", use: "Teks bantuan di kartu" },
  { fg: "ink-muted", bg: "sunken", role: "body", use: "Tombol nonaktif" },

  { fg: "on-solid", bg: "primary", role: "body", use: "Tombol utama, pita atas" },
  { fg: "on-solid", bg: "primary-strong", role: "body", use: "Tombol utama saat disentuh" },
  { fg: "primary", bg: "surface", role: "body", use: "Tautan, tombol kedua" },
  { fg: "primary", bg: "canvas", role: "body", use: "Tautan di halaman" },
  { fg: "primary", bg: "primary-soft", role: "text", use: "Tombol kedua saat disentuh" },
  { fg: "on-primary-soft", bg: "primary-soft", role: "body", use: "Pilihan yang dipilih" },

  { fg: "triage-green-ink", bg: "triage-green-bg", role: "body", use: "HIJAU: teks" },
  { fg: "on-solid", bg: "triage-green-solid", role: "text", use: "HIJAU: lencana penuh" },
  { fg: "triage-yellow-ink", bg: "triage-yellow-bg", role: "body", use: "KUNING: teks" },
  { fg: "on-solid", bg: "triage-yellow-solid", role: "text", use: "KUNING: lencana penuh" },
  { fg: "triage-red-ink", bg: "triage-red-bg", role: "body", use: "MERAH: teks, pesan galat" },
  { fg: "triage-red-ink", bg: "surface", role: "body", use: "Galat isian, tombol bahaya" },
  { fg: "triage-red-ink", bg: "canvas", role: "body", use: "Galat di halaman" },
  { fg: "on-solid", bg: "triage-red-solid", role: "text", use: "MERAH: lencana penuh" },
  { fg: "on-solid", bg: "triage-red-strong", role: "body", use: "MERAH: penghitung peringatan" },
  { fg: "info-ink", bg: "info-bg", role: "body", use: "Pemberitahuan" },
  { fg: "on-solid", bg: "ink", role: "body", use: "Nomor urut antrean" },
  { fg: "triage-green-ink", bg: "surface", role: "body", use: "Keterangan sudah ditanggapi" },

  { fg: "line-strong", bg: "surface", role: "ui", use: "Garis tepi isian di kartu" },
  { fg: "line-strong", bg: "canvas", role: "ui", use: "Garis tepi isian di halaman" },
  { fg: "line-strong", bg: "sunken", role: "ui", use: "Garis tepi di bidang redup" },
  { fg: "primary", bg: "primary-soft", role: "ui", use: "Garis tepi pilihan yang dipilih" },
  { fg: "focus", bg: "surface", role: "ui", use: "Cincin fokus di kartu" },
  { fg: "focus", bg: "canvas", role: "ui", use: "Cincin fokus di halaman" },
  { fg: "triage-green-solid", bg: "triage-green-bg", role: "ui", use: "HIJAU: ikon dan garis tepi" },
  { fg: "triage-green-solid", bg: "surface", role: "ui", use: "HIJAU: garis tepi di kartu" },
  { fg: "triage-yellow-solid", bg: "triage-yellow-bg", role: "ui", use: "KUNING: ikon dan garis tepi" },
  { fg: "triage-yellow-solid", bg: "surface", role: "ui", use: "KUNING: garis tepi di kartu" },
  { fg: "triage-red-solid", bg: "triage-red-bg", role: "ui", use: "MERAH: ikon dan garis tepi" },
  { fg: "triage-red-solid", bg: "surface", role: "ui", use: "MERAH: garis tepi di kartu" },
  { fg: "info-ink", bg: "surface", role: "ui", use: "Pemberitahuan: garis tepi" },
];

/** Type steps, mirrored from `--text-*` in globals.css (rem at a 16px root). */
export const typeScale = [
  { token: "text-5xl", rem: 3.5, use: "Angka tanggal" },
  { token: "text-4xl", rem: 2.75, use: "Angka hitung mundur" },
  { token: "text-3xl", rem: 2.125, use: "Judul halaman keluarga" },
  { token: "text-2xl", rem: 1.75, use: "Judul halaman" },
  { token: "text-xl", rem: 1.5, use: "Judul bagian" },
  { token: "text-lg", rem: 1.25, use: "Tombol, pertanyaan, isian" },
  { token: "text-base", rem: 1.125, use: "Teks utama" },
  { token: "text-sm", rem: 1, use: "Keterangan kecil di konsol perawat" },
] as const;

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
  landing: {
    title: "Pengingat Harian",
    body: "Buka tautan yang diberikan petugas Puskesmas untuk melanjutkan.",
    nurseLogin: "Masuk untuk petugas Puskesmas",
  },
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
  loading: "Memuat...",
  loadFailed: "Halaman belum bisa dibuka. Coba lagi sebentar lagi.",
  retry: "Coba lagi",
  consent: {
    title: "Sebelum mulai",
    // The five required statements. Each one stays a separate string so the
    // wording test can assert that every one is present.
    collected:
      "Layanan ini membantu keluarga dan perawat Puskesmas memantau minum obat harian. Kami mencatat: obat diminum atau tidak, keluhan yang Anda pilih, dan catatan singkat. Jangan tulis nama atau alamat.",
    visibility:
      "Catatan hanya dapat dilihat oleh perawat Puskesmas Anda.",
    automated:
      "Catatan dibaca oleh sistem otomatis setelah data pribadi dihapus.",
    notReplacement: "Layanan ini tidak menggantikan perawat.",
    withdraw:
      "Anda bisa berhenti kapan saja dengan menghubungi Puskesmas.",
    agree: "Saya setuju",
    decline: "Tidak setuju",
    saving: "Menyimpan...",
    saveFailed: "Persetujuan belum tersimpan. Coba lagi.",
  },
  declined: {
    title: "Baik, tidak ada yang dicatat",
    body: "Tidak ada data yang disimpan. Jika berubah pikiran, hubungi Puskesmas.",
    contact: (name: string, phone: string) =>
      `Puskesmas ${name}, telepon ${phone}.`,
  },
  invalidLink: {
    title: "Tautan tidak berlaku",
    body: "Tautan tidak berlaku. Hubungi petugas Puskesmas.",
  },
} as const;

export type FamilyCopy = typeof copy;

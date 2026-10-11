/**
 * Family-facing copy, Bahasa Indonesia.
 *
 * NEUTRAL WORDING RULE: nothing a bystander can see may reveal the illness.
 * These strings MUST NOT contain "TB", "TBC", "tuberkulosis" or "TuntasTB".
 * The family area is always titled "Pengingat Harian". An automated test
 * (family-wording.test.ts) enforces this.
 *
 * READING LEVEL: plain words, sentences of at most 20 words, and never the
 * word "aman", a dose or a diagnosis. The same test enforces the first three.
 */
export const copy = {
  appName: "Pengingat Harian",
  shortName: "Pengingat",
  description: "Pengingat harian dan catatan singkat untuk keluarga.",
  /** Last line of every family message. "Puskesmas" is not doubled when the name already has it. */
  contact: (name: string, phone: string) =>
    `${/^puskesmas\b/i.test(name) ? name : `Puskesmas ${name}`}, telepon ${phone}.`,
  call: "Telepon Puskesmas",
  landing: {
    title: "Pengingat Harian",
    body: "Buka tautan yang diberikan petugas Puskesmas untuk melanjutkan.",
    howTitle: "Cara membuka",
    howSteps: [
      "Cari pesan dari petugas Puskesmas.",
      "Ketuk tautan di dalam pesan itu.",
      "Halaman Anda akan terbuka.",
    ],
    lostLink: "Tidak punya tautan? Minta kepada petugas Puskesmas.",
    nurseTitle: "Anda petugas Puskesmas?",
    nurseLogin: "Masuk untuk petugas Puskesmas",
  },
  home: {
    title: "Pengingat Harian",
    greeting: "Selamat datang",
    dayLabel: (day: number) => `Hari ke-${day}`,
    todayPrompt: "Bagaimana kabar hari ini?",
    notReadyTitle: "Catatan harian sedang disiapkan",
    notReadyBody: "Hari ini belum ada yang perlu diisi.",
    nextTitle: "Apa selanjutnya?",
    nextSteps: [
      "Simpan pesan yang berisi tautan ini.",
      "Buka lagi halaman ini besok lewat tautan yang sama.",
      "Catatan harian akan muncul di halaman ini.",
    ],
    helpTitle: "Ada keluhan sekarang?",
    helpBody: "Jangan menunggu. Hubungi perawat Puskesmas.",
    hintNoPersonalData: "Jangan tulis nama atau alamat pada catatan.",
  },
  /** The word shown beside each level's icon. A level is never colour alone. */
  triage: {
    GREEN: { label: "Lanjutkan" },
    YELLOW: { label: "Perawat akan menghubungi" },
    RED: { label: "Segera ke Puskesmas" },
  },
  checkin: {
    submit: "Kirim catatan hari ini",
    thanks: "Terima kasih, catatan sudah tersimpan.",
    doseQuestion: "Obat hari ini sudah diminum?",
    dose: { yes: "Sudah", no: "Belum", partial: "Sebagian" },
    symptomsQuestion: "Ada keluhan hari ini?",
    symptomsHint: "Ketuk semua yang dirasakan. Boleh dilewati.",
    symptoms: {
      nausea: "Mual",
      vomiting: "Muntah",
      dizzy: "Pusing",
      itch: "Gatal atau ruam",
      urine: "Kencing merah",
      yellow: "Mata atau kulit kuning",
      joint: "Nyeri sendi",
      tingling: "Kesemutan",
      fever: "Demam",
      appetite: "Tidak nafsu makan",
      vision: "Penglihatan kabur",
    },
    noteLabel: "Catatan (boleh kosong)",
    noteHint: "Jangan tulis nama atau alamat.",
    noteRemaining: (left: number) => `Sisa ${left} huruf`,
    mic: "Bicara",
    micStop: "Berhenti",
    micListening: "Mendengarkan. Silakan bicara.",
    micSample: "mual terus, matanya agak kuning",
    send: "Kirim",
    sendBlocked: "Pilih dulu: sudah, belum, atau sebagian.",
    sending: "Mengirim...",
    micHint: "Jangan sebut nama atau alamat.",
    sendFailed: "Catatan belum bisa dikirim. Coba lagi.",
    tooMany: "Hari ini sudah terlalu sering mengirim catatan. Hubungi Puskesmas kalau ada keluhan.",
    offlineNotice: "Tidak ada sinyal. Catatan akan dikirim nanti.",
    // Exact wording required by the spec.
    queued: "Belum terkirim, akan dikirim saat ada sinyal",
    statusSent: "Terkirim",
    statusQueued: "Belum terkirim",
    queuedCount: (n: number) => `Ada ${n} catatan yang belum terkirim.`,
    loadingSymptoms: "Memuat pilihan keluhan...",
    noRules: "Pilihan keluhan belum bisa dimuat. Hubungkan ke internet satu kali, lalu buka lagi.",
  },
  reply: {
    title: "Jawaban untuk hari ini",
    actionTitle: "Yang perlu dilakukan",
    source: (label: string) => `Sumber: ${label}`,
    sampleSource: "Panduan Kemenkes, bagian efek samping obat",
    /** Static variants that replace parts of a template (never a dose instruction). */
    variants: {
      stopIntentAction:
        "Jangan berhenti dulu. Tetap minum obat sesuai jadwal. Perawat akan menghubungi Anda dalam 1 hari kerja.",
      noSymptom: "Terima kasih sudah melapor hari ini.",
      doseMissed:
        "Terima kasih sudah jujur melapor. Kalau ada kesulitan minum obat, ceritakan ke perawat.",
    },
    /** Shown on the device while the report has not reached the server. */
    offline: {
      bannerBody: "Ini jawaban sementara dari telepon Anda. Jawaban resmi datang setelah terkirim.",
      // The RED text is three short sentences; the screen shows them as action, notice and call line.
      redAction: "Segera ke Puskesmas atau IGD hari ini.",
      redNotice: "Laporan ini belum sampai ke perawat.",
      redCall: (phone: string) => `Telepon Puskesmas: ${phone}.`,
    },
    GREEN: {
      explanation: "Air kencing merah sering terjadi karena obat ini.",
      action: "Lanjutkan minum obat seperti biasa.",
    },
    YELLOW: {
      explanation: "Mual yang lama perlu dilihat perawat.",
      action:
        "Tetap minum obat, jangan berhenti dulu. Perawat akan menghubungi Anda dalam 1 hari kerja.",
    },
    RED: {
      explanation: "Mata atau kulit kuning perlu diperiksa hari ini.",
      action: "Pergi ke Puskesmas atau IGD hari ini.",
    },
    done: "Selesai",
  },
  pickup: {
    title: "Ambil obat",
    inDays: (days: number) => `Ambil obat ${days} hari lagi`,
    tomorrow: "Ambil obat besok",
    today: "Ambil obat hari ini",
    overdue: "Jadwal ambil obat sudah lewat",
    overdueDays: (days: number) => `Sudah lewat ${days} hari`,
    daysLeft: "hari lagi",
    dueOn: (date: string) => `Jadwal: ${date}`,
    place: (name: string) => `Tempat: Puskesmas ${name}`,
    nudgeTitle: "Sudah dekat",
    nudgeBody: "Siapkan waktu untuk pergi ke Puskesmas.",
    todayBody: "Datang ke Puskesmas hari ini pada jam buka.",
    overdueBody: "Hubungi Puskesmas hari ini untuk mengambil obat.",
  },
  ask: {
    title: "Tanya",
    intro: "Tulis pertanyaan Anda dengan kata sendiri.",
    label: "Pertanyaan Anda",
    examplesTitle: "Contoh pertanyaan",
    exampleAnswered: "Kenapa kencingnya jadi merah?",
    exampleAbstain: "Boleh dikurangi obatnya?",
    submit: "Tanya",
    empty: "Tulis dulu pertanyaan Anda.",
    answerTitle: "Jawaban",
    sampleAnswer:
      "Warna merah atau oranye pada air kencing sering muncul karena obat ini. Warna itu hilang setelah pengobatan selesai.",
    abstain: "Saya belum bisa menjawab ini, tanyakan ke perawat",
    again: "Tanya lagi",
  },
  loading: "Memuat...",
  loadFailed: "Halaman belum bisa dibuka. Coba lagi sebentar lagi.",
  loadFailedTitle: "Belum bisa dibuka",
  loadFailedHint: "Periksa sinyal atau kuota internet Anda, lalu ketuk Coba lagi.",
  retry: "Coba lagi",
  consent: {
    title: "Sebelum mulai",
    stepLabel: "Langkah 1 dari 2",
    steps: ["Persetujuan", "Catatan harian"],
    intro: "Baca lima hal ini. Lalu pilih setuju atau tidak setuju.",
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
    reopen: "Buka persetujuan lagi",
  },
  invalidLink: {
    title: "Tautan tidak berlaku",
    body: "Tautan tidak berlaku. Hubungi petugas Puskesmas.",
    next: "Minta tautan baru kepada petugas. Tautan lama tidak bisa dipakai lagi.",
  },
} as const;

export type FamilyCopy = typeof copy;

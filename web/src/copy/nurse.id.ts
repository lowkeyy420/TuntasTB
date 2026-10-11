/**
 * Nurse-facing copy, Bahasa Indonesia. The nurse console sits behind login
 * and MAY use the product name "TuntasTB".
 */
export const copy = {
  appName: "TuntasTB",
  login: {
    title: "Masuk Perawat",
    subtitle: "Konsol perawat TuntasTB",
    emailLabel: "Email",
    passwordLabel: "Kata sandi",
    submit: "Masuk",
    invalidCredentials: "Email atau kata sandi salah",
    tooMany: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
  },
  console: {
    title: "Konsol Perawat",
    logout: "Keluar",
    patientsLink: "Daftar pasien",
    newPatientLink: "Daftarkan pasien baru",
  },
  patients: {
    listTitle: "Daftar Pasien",
    newTitle: "Daftarkan Pasien",
    newButton: "Pasien baru",
    backToList: "Kembali ke daftar",
    empty: "Belum ada pasien.",
    loading: "Memuat...",
    loadFailed: "Daftar pasien gagal dimuat. Coba lagi.",
    actionFailed: "Tindakan gagal. Coba lagi.",
    form: {
      codeLabel: "Kode pasien",
      codeHint: "Jangan isi nama. Contoh: JKT-0042",
      startDateLabel: "Tanggal mulai",
      phaseLabel: "Fase pengobatan",
      phaseIntensive: "Intensif",
      phaseContinuation: "Lanjutan",
      pickupLabel: "Jarak ambil obat (hari)",
      pickupHint: "Antara 1 dan 60 hari",
      pmoLabel: "Nomor HP PMO (boleh kosong)",
      pmoHint: "Hanya disimpan sebagai kode acak, nomornya tidak disimpan.",
      submit: "Daftarkan",
      submitting: "Menyimpan...",
    },
    validation: {
      codeRequired: "Kode pasien wajib diisi",
      codeFormat:
        "Kode 3 sampai 20 karakter: huruf besar, angka, dan tanda hubung (-), tanpa spasi",
      codeTaken: "Kode sudah dipakai",
      startDateRequired: "Tanggal mulai wajib diisi",
      startDateInvalid: "Tanggal mulai tidak valid",
      startDateFuture: "Tanggal mulai tidak boleh di masa depan",
      phaseRequired: "Fase pengobatan wajib dipilih",
      pickupRequired: "Jarak ambil obat wajib diisi",
      pickupRange: "Jarak ambil obat harus antara 1 dan 60 hari",
      pmoInvalid: "Nomor HP PMO tidak valid",
      unknownField: "Isian tidak dikenali",
      nothingToUpdate: "Tidak ada yang diubah",
    },
    columns: {
      code: "Kode",
      day: "Hari ke-",
      phase: "Fase",
      pmo: "PMO",
      consent: "Persetujuan",
      link: "Tautan",
      actions: "Tindakan",
    },
    status: {
      pmoYes: "Ada PMO",
      pmoNo: "Tanpa PMO",
      consentGiven: "Sudah setuju",
      consentPending: "Belum setuju",
      linkActive: "Aktif",
      linkRevoked: "Dicabut",
      linkNone: "Belum ada",
    },
    phase: {
      intensive: "Intensif",
      continuation: "Lanjutan",
    },
    actions: {
      rotate: "Ganti tautan",
      revoke: "Cabut tautan",
      confirmRotate:
        "Ganti tautan keluarga? Tautan lama langsung tidak berlaku.",
      confirmRevoke:
        "Cabut tautan keluarga? Tautan tidak akan bisa dibuka sampai Anda menggantinya.",
    },
    linkModal: {
      title: "Tautan keluarga",
      warning: "Tautan hanya ditampilkan sekali",
      instruction:
        "Salin tautan ini dan kirim lewat saluran yang sudah biasa Anda pakai. Jika hilang, ganti tautan dari daftar pasien.",
      copy: "Salin tautan",
      copied: "Tautan disalin",
      close: "Selesai",
    },
  },
} as const;

export type NurseCopy = typeof copy;

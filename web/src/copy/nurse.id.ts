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
  },
} as const;

export type NurseCopy = typeof copy;

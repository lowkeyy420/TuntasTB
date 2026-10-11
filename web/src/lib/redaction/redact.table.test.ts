import { describe, it, expect } from "vitest";
import { redact } from "./redact";

describe("redact: determinism", () => {
  it("produces identical output for the same input 100 times", () => {
    const input =
      "nama saya Budi, NIK 3174012345678901, telp 0812-3456-7890, email b@x.com, Jl. Mawar No. 1";
    const first = redact(input);
    for (let i = 0; i < 100; i++) {
      expect(redact(input)).toBe(first);
    }
  });
});

interface Row {
  input: string;
  mustContain?: string[];
  mustNotContain?: string[];
  equals?: string;
}

const rows: Row[] = [
  { input: "telp 0813 1111 2222", mustContain: ["[TELEPON]"], mustNotContain: ["1111"] },
  { input: "hp 081234567890", mustContain: ["[TELEPON]"] },
  { input: "wa +62 877 0000 1111", mustContain: ["[TELEPON]"], mustNotContain: ["877"] },
  { input: "nik 3201099988776655", mustContain: ["[NIK]"] },
  { input: "KTP 3201 0999 8877 6655", mustContain: ["[NIK]"] },
  { input: "email dokter@puskesmas.go.id", mustContain: ["[EMAIL]"] },
  { input: "kirim ke a.b-c@sub.domain.co", mustContain: ["[EMAIL]"] },
  { input: "nama saya Rudi Hartono", equals: "nama saya [NAMA]" },
  { input: "saya bernama Dewi", equals: "saya bernama [NAMA]" },
  { input: "namanya Agus", equals: "namanya [NAMA]" },
  { input: "nama anak saya Putri", equals: "nama anak saya [NAMA]" },
  { input: "nama bapak saya Joko Widodo", equals: "nama bapak saya [NAMA]" },
  { input: "Jl. Melati No. 7", mustContain: ["[ALAMAT]"], mustNotContain: ["Melati"] },
  { input: "jalan Anggrek 10", mustContain: ["[ALAMAT]"], mustNotContain: ["Anggrek"] },
  { input: "alamat RT 02/RW 09", mustContain: ["[ALAMAT]"] },
  { input: "saya mual dan jalan sempoyongan", equals: "saya mual dan jalan sempoyongan" },
  { input: "pasien batuk berdahak", equals: "pasien batuk berdahak" },
  { input: "demam tinggi tiga hari", equals: "demam tinggi tiga hari" },
  { input: "saya merasa lebih baik", equals: "saya merasa lebih baik" },
  { input: "mata terlihat kuning", equals: "mata terlihat kuning" },
  { input: "nama saya Budi, telp 08123456789", mustContain: ["[NAMA]", "[TELEPON]"] },
  { input: "NIK 1122334455667788 email x@y.com", mustContain: ["[NIK]", "[EMAIL]"] },
  { input: "tinggal di Jl. Sudirman, mual pagi", mustContain: ["[ALAMAT]"], mustNotContain: ["Sudirman"] },
  { input: "hubungi 0821-9999-8888 segera", mustContain: ["[TELEPON]"], mustNotContain: ["9999"] },
  { input: "saya Andi dari RT 01/RW 02", mustContain: ["[NAMA]", "[ALAMAT]"] },
  { input: "tidak ada keluhan hari ini", equals: "tidak ada keluhan hari ini" },
  { input: "obat diminum tadi pagi", equals: "obat diminum tadi pagi" },
  { input: "nafsu makan menurun", equals: "nafsu makan menurun" },
  { input: "email: rina.k@mail.id, nik 9988776655443322", mustContain: ["[EMAIL]", "[NIK]"] },
  { input: "whatsapp +6281200009999", mustContain: ["[TELEPON]"] },
];

describe("redact: 30 mixed sentences", () => {
  it("has 30 rows", () => {
    expect(rows.length).toBe(30);
  });

  rows.forEach((row, i) => {
    it(`row ${i + 1}: ${row.input}`, () => {
      const out = redact(row.input);
      if (row.equals !== undefined) expect(out).toBe(row.equals);
      for (const s of row.mustContain ?? []) expect(out).toContain(s);
      for (const s of row.mustNotContain ?? []) expect(out).not.toContain(s);
    });
  });
});

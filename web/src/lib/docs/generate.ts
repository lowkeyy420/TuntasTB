import { scoreRisk } from "@/lib/risk/score";
import type { RiskPoints, RiskSnapshot } from "@/lib/risk/types";
import type { Lexicon, LexiconEntry, TriageTable } from "@/lib/triage/types";

/**
 * Pure generators for the human-readable rule documents:
 *  - docs/triage-table.md  (clinician review, add-triage-rules 6.3)
 *  - docs/risk-score.md    (nurses and reviewers, add-dropout-risk-score 6.1)
 *
 * They read the JSON files in rules/ only, so a document can never disagree
 * with the rules the software runs. `web/scripts/generate-docs.ts` writes the
 * files; `npm run docs:check` (and a unit test) fail when a committed file is stale.
 */

const HEADER = (source: string) =>
  `<!-- Dihasilkan otomatis dari ${source} oleh web/scripts/generate-docs.ts. Jangan diedit; ubah file JSON lalu jalankan: cd web; npm run docs:generate -->`;

/** Escapes a table cell: pipes would split the cell, line breaks would end the row. */
const cell = (text: string | number | undefined): string =>
  String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

const row = (...cells: Array<string | number | undefined>): string => `| ${cells.map(cell).join(" | ")} |`;

function table(head: string[], rows: string[][]): string[] {
  return [row(...head), row(...head.map(() => "---")), ...rows.map((r) => row(...r))];
}

const levelWord = { GREEN: "HIJAU", YELLOW: "KUNING", RED: "MERAH" } as const;

function entryTerms(entry: LexiconEntry | undefined): string {
  if (!entry) return "";
  const parts: string[] = [];
  if (entry.any?.length) parts.push(entry.any.join(", "));
  if (entry.combo?.length) {
    parts.push(entry.combo.map((group) => `(${group.join(" / ")})`).join(" + "));
  }
  return parts.join("; ");
}

export function generateTriageTableDoc(tableData: TriageTable, lexicon: Lexicon): string {
  const L: string[] = [];
  L.push(HEADER("rules/triage-table.json dan rules/lexicon.id.json"), "");
  L.push("# Tabel triase untuk ditinjau klinisi", "");
  L.push(
    "Dokumen ini adalah tampilan yang mudah dibaca dari aturan yang dipakai aplikasi. Aturan yang menentukan level, bukan model bahasa.",
    "Level hanya boleh naik: gejala yang tidak dikenal menjadi KUNING, dan kata tanda bahaya (walau ragu) menjadi MERAH.",
    "",
  );
  L.push(`- Versi tabel: \`${tableData.version}\``);
  L.push(`- Versi kamus kata: \`${lexicon.version}\``);
  L.push(`- Status tinjauan: **${tableData.review_status}**`, "");

  L.push("## Gejala dan level", "");
  L.push(
    ...table(
      ["Kode", "Level", "Gejala (teks untuk keluarga)", "Catatan"],
      tableData.symptoms.map((s) => [
        s.code,
        levelWord[s.level],
        s.label_id,
        s.chip_only ? "hanya pilihan di layar, tanpa kata kunci" : "",
      ]),
    ),
    "",
  );

  L.push("## Aturan lama keluhan", "");
  if (tableData.duration_rules.length === 0) {
    L.push("Tidak ada aturan lama keluhan.", "");
  } else {
    L.push(
      ...table(
        ["Gejala", "Lama keluhan", "Level"],
        tableData.duration_rules.map((r) => [
          r.codes.join(", "),
          `${r.min_days} hari atau lebih`,
          levelWord[r.level],
        ]),
      ),
      "",
    );
  }

  L.push("## Gejala tidak dikenal", "");
  L.push(
    `Teks yang tidak cocok dengan gejala mana pun, atau kode gejala yang tidak dikenal, mendapat level **${levelWord[tableData.unknown_level]}**.`,
    "",
  );

  L.push("## Tanda bahaya (selalu MERAH)", "");
  L.push(
    "Kata kunci berikut memaksa level MERAH tanpa melihat hal lain. Tidak ada penanganan kata \"tidak\": \"matanya tidak kuning\" tetap MERAH, karena satu salah baca ke arah aman lebih berbahaya daripada satu telepon yang tidak perlu.",
    "",
  );
  L.push(
    ...table(
      ["Kode", "Kata kunci"],
      Object.entries(lexicon.red_flags).map(([code, e]) => [code, entryTerms(e)]),
    ),
    "",
  );

  L.push("## Kata kunci gejala", "");
  L.push(
    ...table(
      ["Kode", "Level", "Kata kunci"],
      Object.entries(lexicon.symptoms).map(([code, e]) => [
        code,
        levelWord[tableData.symptoms.find((s) => s.code === code)?.level ?? tableData.unknown_level],
        entryTerms(e),
      ]),
    ),
    "",
  );
  if (lexicon.watch_words?.length) {
    L.push(
      `Kata pemantau (menunjuk gejala yang belum ada di tabel, tidak pernah HIJAU): ${lexicon.watch_words.join(", ")}.`,
      "",
    );
  }

  L.push("## Teks untuk keluarga per level", "");
  for (const level of ["GREEN", "YELLOW", "RED"] as const) {
    const t = tableData.levels[level];
    L.push(`### ${levelWord[level]}`, "", `- Penjelasan: ${t.message_id}`, `- Tindakan: ${t.action_id}`, "");
  }
  L.push("### Peringatan tetap (dipakai bila alur bahasa tidak tersedia)", "", `> ${tableData.fallback_warning_id}`, "");

  L.push("## Yang diminta dari peninjau", "");
  L.push(
    "1. Apakah level setiap gejala di atas sesuai pedoman nasional yang berlaku?",
    "2. Apakah teks tindakan MERAH (\"Berhenti dulu dan segera ke Puskesmas atau IGD hari ini\") sudah tepat?",
    "3. Apakah ambang lama keluhan sudah sesuai? Ambang diset ke 7 hari atau lebih, ke arah yang lebih aman.",
    "4. Kata kunci apa yang kurang? Tambahkan sebagai kalimat nyata dari pasien atau keluarga.",
    "",
  );
  return `${L.join("\n").trimEnd()}\n`;
}

const DEMO_BASE: RiskSnapshot = {
  doseStatus: "yes",
  consecutiveMissedBefore: 0,
  stopIntent: false,
  stigma: false,
  maxPersistenceDays: 0,
  level: "GREEN",
  missedPickup: false,
  hasPmo: true,
  daysSinceLastCheckin: 0,
};

const EXAMPLES: Array<{ title: string; story: string; snapshot: Partial<RiskSnapshot> }> = [
  {
    title: "Contoh demo: hari ke-41",
    story:
      "Mual sudah seminggu, keluarga bilang pasien merasa sudah sembuh dan mau berhenti. Level KUNING hari ini.",
    snapshot: { stopIntent: true, maxPersistenceDays: 7, level: "YELLOW" },
  },
  {
    title: "Contoh: diam tiga hari tanpa pendamping",
    story: "Tidak ada laporan selama 3 hari dan tidak ada pendamping minum obat.",
    snapshot: { doseStatus: null, level: null, hasPmo: false, daysSinceLastCheckin: 3 },
  },
  {
    title: "Contoh: tanda bahaya",
    story: "Satu laporan MERAH. Skor hanya mengurutkan daftar; level MERAH tetap diputuskan oleh aturan triase.",
    snapshot: { level: "RED" },
  },
];

const READINGS = [
  "\"Tidak minum obat hari ini\" (+2) dan \"hari berturut-turut sebelumnya\" (+2 per hari, batas 10 poin) adalah dua faktor terpisah. Tidak minum hari ini dan dua hari sebelumnya = 2 + 4 = 6.",
  "Obat diminum sebagian tidak menyambung dan tidak memutus rangkaian hari tidak minum. Hanya status \"belum\" yang dihitung tidak minum.",
  "Hari tanpa laporan memutus rangkaian. Diam sudah dinilai oleh faktor \"tidak ada laporan\", jadi tidak dihitung dua kali.",
  "Level KUNING dan MERAH hari ini saling meniadakan dan memakai level akhir (setelah aturan lokal dan alur digabung).",
  "Keluhan yang belum membaik diberi poin satu kali saja, berapa pun jumlah gejalanya.",
  "\"Tidak ada laporan\" dihitung dalam hari kalender Jakarta sejak laporan terakhir; bila belum pernah lapor, sejak pasien didaftarkan.",
];

export function generateRiskScoreDoc(points: RiskPoints): string {
  const L: string[] = [];
  L.push(HEADER("rules/risk-points.json"), "");
  L.push("# Skor risiko putus berobat", "");
  L.push(
    "Skor adalah jumlah poin yang terdokumentasi. Skor hanya mengurutkan daftar perawat dan tidak pernah mengubah level triase. Tidak ada model bahasa di dalamnya.",
    "",
  );
  L.push(`- Versi tabel poin: \`${points.version}\``, "");

  L.push("## Tabel poin", "");
  L.push(
    ...table(
      ["Faktor", "Poin", "Batas / ambang", "Alasan yang ditampilkan"],
      Object.entries(points.factors).map(([id, f]) => {
        const limits = [
          f.cap !== undefined ? `maksimal ${f.cap} poin` : "",
          f.min_days !== undefined ? `mulai ${f.min_days} hari` : "",
        ]
          .filter(Boolean)
          .join(", ");
        return [id, `+${f.points}`, limits, f.text_id];
      }),
    ),
    "",
  );

  L.push("## Pita risiko", "");
  const names = { low: "Rendah", medium: "Sedang", high: "Tinggi" } as const;
  let previous = -1;
  L.push(
    ...table(
      ["Pita", "Skor"],
      points.bands.map((b) => {
        const range = b.max === undefined ? `${previous + 1} atau lebih` : `${previous + 1} sampai ${b.max}`;
        if (b.max !== undefined) previous = b.max;
        return [names[b.band], range];
      }),
    ),
    "",
  );

  L.push("## Cara membaca daftar poin", "");
  for (const reading of READINGS) L.push(`- ${reading}`);
  L.push("");

  L.push("## Contoh", "");
  for (const ex of EXAMPLES) {
    const result = scoreRisk({ ...DEMO_BASE, ...ex.snapshot }, points);
    L.push(`### ${ex.title}`, "", ex.story, "");
    L.push(
      ...table(
        ["Alasan", "Poin"],
        result.reasons.map((r) => [r.text, `+${r.points}`]),
      ),
      "",
      `Skor **${result.score}**, pita **${names[result.band]}**.`,
      "",
    );
  }
  return `${L.join("\n").trimEnd()}\n`;
}

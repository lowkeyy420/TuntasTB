/**
 * Made-up data for the mockups on /design. Nothing here comes from the
 * database and nothing is sent anywhere. Dates are fixed so the mockups look
 * the same every day.
 */
import type { QueueItem } from "@/lib/queue/types";
import type { Level } from "@/lib/triage/types";

export const mockPuskesmas = { name: "Contoh", phone: "021-555-0100" };

export const mockToday = "2026-10-12";
export const mockTreatmentDay = 18;

export const mockPickup = {
  five: "2026-10-17",
  tomorrow: "2026-10-13",
  today: "2026-10-12",
  overdue: "2026-10-10",
} as const;

/** Already ranked: highest score first, then most recent report. */
export const mockQueue: Array<QueueItem & { level: Level }> = [
  {
    patientId: "mock-1",
    code: "JKT-0042",
    day: 41,
    score: 8,
    band: "high",
    level: "YELLOW",
    reason: "Mual sudah 7 hari dan pasien merasa sudah sembuh.",
    action: "call",
    overridden: false,
    lastCheckin: "kemarin 19.20",
    factors: [
      { text: "Mengatakan ingin berhenti atau merasa sudah sembuh", points: 4 },
      { text: "Keluhan yang sama sudah 7 hari", points: 3 },
      { text: "Keluhan hari ini perlu dihubungi perawat", points: 1 },
    ],
  },
  {
    patientId: "mock-2",
    code: "JKT-0017",
    day: 23,
    score: 5,
    band: "medium",
    level: "GREEN",
    reason: "Tidak ada laporan selama 3 hari.",
    action: "visit",
    overridden: false,
    lastCheckin: "3 hari lalu",
    factors: [
      { text: "Tidak ada laporan 3 hari", points: 3 },
      { text: "Tidak ada pendamping minum obat", points: 2 },
    ],
  },
  {
    patientId: "mock-3",
    code: "JKT-0031",
    day: 58,
    score: 4,
    band: "medium",
    level: "GREEN",
    reason: "Jadwal ambil obat terlewat 2 hari.",
    action: "earlyPickup",
    overridden: false,
    lastCheckin: "kemarin 07.05",
    factors: [{ text: "Jadwal ambil obat terlewat", points: 4 }],
  },
  {
    patientId: "mock-4",
    code: "JKT-0008",
    day: 12,
    score: 0,
    band: "low",
    level: "GREEN",
    reason: "Minum obat teratur, tidak ada keluhan.",
    action: "none",
    overridden: false,
    lastCheckin: "kemarin 06.40",
    factors: [],
  },
];

export interface RedAlert {
  id: string;
  code: string;
  day: number;
  flags: string[];
  time: string;
}

export const mockAlerts: RedAlert[] = [
  { id: "a1", code: "JKT-0042", day: 41, flags: ["Mata atau kulit kuning", "Muntah terus"], time: "07.42" },
  { id: "a2", code: "JKT-0025", day: 9, flags: ["Penglihatan kabur"], time: "06.15" },
];

/** The time shown when the reviewer presses the acknowledge button. */
export const mockAckTime = "07.45";

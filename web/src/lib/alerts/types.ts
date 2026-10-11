/** Alert shapes shared by the API and the console. Types only: safe for client components. */

/** An alert as the console shows it. Never contains the PMO contact or any note text. */
export interface AlertItem {
  id: string;
  patientId: string;
  code: string;
  /** Treatment day of the check-in that raised the alert. */
  day: number | null;
  /** Red-flag symptoms, in plain words. */
  flags: string[];
  /** Clock time in Jakarta, `07.42`. */
  time: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgedTime: string | null;
}

export type AlertStatus = "open" | "acknowledged" | "all";

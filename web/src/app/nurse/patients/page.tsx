import Link from "next/link";
import type { Metadata } from "next";
import { copy } from "@/copy/nurse.id";
import { PatientList } from "./PatientList";

export const metadata: Metadata = { title: `${copy.patients.listTitle} | ${copy.appName}` };

export default function PatientsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{copy.patients.listTitle}</h1>
        <Link
          href="/nurse/patients/new"
          className="inline-flex min-h-12 items-center rounded bg-teal-700 px-4 text-lg font-medium text-white"
        >
          {copy.patients.newButton}
        </Link>
      </header>
      <PatientList />
    </main>
  );
}

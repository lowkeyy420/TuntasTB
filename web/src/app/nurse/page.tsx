import Link from "next/link";
import { copy } from "@/copy/nurse.id";

export default function NurseConsolePage() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">{copy.console.title}</h1>
        <p className="text-base text-black/60">{copy.appName}</p>
      </header>
      <nav className="flex flex-col gap-3">
        <Link
          href="/nurse/patients"
          className="inline-flex min-h-12 items-center rounded border border-teal-700 px-4 text-lg text-teal-800"
        >
          {copy.console.patientsLink}
        </Link>
        <Link
          href="/nurse/patients/new"
          className="inline-flex min-h-12 items-center rounded bg-teal-700 px-4 text-lg font-medium text-white"
        >
          {copy.console.newPatientLink}
        </Link>
      </nav>
    </main>
  );
}

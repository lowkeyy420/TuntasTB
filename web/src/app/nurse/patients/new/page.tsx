import Link from "next/link";
import type { Metadata } from "next";
import { copy } from "@/copy/nurse.id";
import { PatientForm } from "../PatientForm";

export const metadata: Metadata = { title: `${copy.patients.newTitle} | ${copy.appName}` };

export default function NewPatientPage() {
  return (
    <main className="mx-auto max-w-md space-y-5 p-4">
      <Link href="/nurse/patients" className="inline-block py-2 text-lg text-teal-800 underline">
        {copy.patients.backToList}
      </Link>
      <h1 className="text-2xl font-semibold">{copy.patients.newTitle}</h1>
      <PatientForm />
    </main>
  );
}

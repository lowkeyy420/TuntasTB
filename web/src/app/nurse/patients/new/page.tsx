import type { Metadata } from "next";
import { copy } from "@/copy/nurse.id";
import { PageHeader } from "@/components/ui";
import { PatientForm } from "../PatientForm";

export const metadata: Metadata = { title: `${copy.patients.newTitle} | ${copy.appName}` };

export default function NewPatientPage() {
  return (
    <main className="flex w-full max-w-xl flex-col gap-6">
      <PageHeader
        title={copy.patients.newTitle}
        subtitle={copy.patients.newIntro}
        back={{ href: "/nurse/patients", label: copy.patients.backToList }}
      />
      <PatientForm />
    </main>
  );
}

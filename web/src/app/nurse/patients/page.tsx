import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { ButtonLink, PageHeader } from "@/components/ui";
import { PatientList } from "./PatientList";

export const metadata: Metadata = { title: `${copy.patients.listTitle} | ${copy.appName}` };

export default function PatientsPage() {
  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title={copy.patients.listTitle}
        subtitle={copy.patients.listIntro}
        action={
          <ButtonLink block size="md" icon={UserPlus} href="/nurse/patients/new">
            {copy.patients.newButton}
          </ButtonLink>
        }
      />
      <PatientList />
    </main>
  );
}

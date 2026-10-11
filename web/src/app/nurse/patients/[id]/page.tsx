import type { Metadata } from "next";
import { copy } from "@/copy/nurse.id";
import { TimelineScreen } from "./TimelineScreen";

export const metadata: Metadata = { title: copy.queue.pageTitle };

export default async function PatientTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <TimelineScreen patientId={id} />
    </main>
  );
}

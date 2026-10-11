import type { Metadata } from "next";
import { copy } from "@/copy/nurse.id";
import { AlertsScreen } from "./AlertsScreen";

export const metadata: Metadata = { title: copy.alerts.pageTitle };

export default function AlertsPage() {
  return (
    <main>
      <AlertsScreen />
    </main>
  );
}

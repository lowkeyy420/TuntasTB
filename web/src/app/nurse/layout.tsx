import type { Metadata } from "next";
import { copy } from "@/copy/nurse.id";
import { NurseShell } from "./NurseShell";

export const metadata: Metadata = {
  title: { default: copy.console.title, template: "%s" },
  robots: { index: false, follow: false },
};

export default function NurseLayout({ children }: { children: React.ReactNode }) {
  return <NurseShell>{children}</NurseShell>;
}

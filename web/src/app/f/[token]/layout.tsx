import type { Metadata } from "next";
import { copy } from "@/copy/family.id";
import { FamilyShell } from "@/components/FamilyShell";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";

// The link token sits in the URL: keep it out of Referer headers and search indexes.
export const metadata: Metadata = {
  title: copy.appName,
  description: copy.description,
  applicationName: copy.appName,
  manifest: "/manifest.webmanifest",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FamilyShell>
      <ServiceWorkerRegistrar />
      {children}
    </FamilyShell>
  );
}

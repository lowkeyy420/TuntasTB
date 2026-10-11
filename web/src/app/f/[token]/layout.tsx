import type { Metadata } from "next";
import { copy } from "@/copy/family.id";

export const metadata: Metadata = {
  title: copy.appName,
  description: copy.description,
  applicationName: copy.appName,
  manifest: "/manifest.webmanifest",
};

export default function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <section className="mx-auto max-w-md p-4">{children}</section>;
}

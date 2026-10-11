import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { copy } from "@/copy/design.id";
import { copy as nurse } from "@/copy/nurse.id";
import { FamilyShell } from "@/components/FamilyShell";
import { AppBar } from "@/components/ui";
import { screens } from "../../screens";

// Mockups with made-up data. Kept out of search indexes; the tab title stays neutral.
export const metadata: Metadata = {
  title: copy.title,
  robots: { index: false, follow: false },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return screens.map((s) => ({ screen: s.slug }));
}

/**
 * One mockup as a full page. The preview page embeds these at phone width,
 * and each can be opened directly on a real phone.
 */
export default async function MockScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen: slug } = await params;
  const screen = screens.find((s) => s.slug === slug);
  if (!screen) notFound();

  if (screen.area === "family") return <FamilyShell>{screen.render()}</FamilyShell>;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar title={nurse.appName} icon={Stethoscope} className="max-w-6xl" />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{screen.render()}</div>
    </div>
  );
}

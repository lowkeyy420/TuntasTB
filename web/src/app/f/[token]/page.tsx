import type { Metadata } from "next";
import { copy } from "@/copy/family.id";

export const metadata: Metadata = {
  title: copy.home.title,
};

export default function FamilyHome() {
  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">{copy.home.title}</h1>
        <p className="text-sm text-black/60">{copy.home.greeting}</p>
      </header>
      <p>{copy.home.todayPrompt}</p>
      <p className="text-xs text-black/50">{copy.home.hintNoPersonalData}</p>
    </main>
  );
}

import { copy } from "@/copy/nurse.id";

export default function NurseConsolePage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">{copy.console.title}</h1>
      <p className="text-sm text-black/60">{copy.appName}</p>
    </main>
  );
}

import type { Metadata } from "next";
import { copy } from "@/copy/nurse.id";
import { QueueScreen } from "./QueueScreen";

// Neutral tab title: the console may be open on a shared screen.
export const metadata: Metadata = { title: copy.queue.pageTitle };

export default function QueuePage() {
  return (
    <main>
      <QueueScreen />
    </main>
  );
}

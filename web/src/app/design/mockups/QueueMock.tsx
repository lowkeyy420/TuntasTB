import { QueueList } from "@/components/queue/QueueList";
import { mockQueue, mockToday } from "./data";

/** Nurse morning queue mockup: the real list component with made-up entries. */
export function QueueMock() {
  return (
    <main>
      <QueueList entries={mockQueue} today={mockToday} />
    </main>
  );
}

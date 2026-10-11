import { copy } from "@/copy/family.id";
import { ReplyView as SharedReplyView } from "@/components/checkin/ReplyView";
import type { TriageLevel } from "@/components/ui";
import { mockPuskesmas } from "./data";

/**
 * The reply mockup: the real reply component with the made-up sample texts
 * from the copy file and the sample Puskesmas. The real screen passes the
 * server's reply to the same component.
 */
export function ReplyView({ level, onDone }: { level: TriageLevel; onDone?: () => void }) {
  const t = copy.reply;
  return (
    <SharedReplyView
      level={level}
      explanation={t[level].explanation}
      action={t[level].action}
      sourceLabel={t.sampleSource}
      contactLine={copy.contact(mockPuskesmas.name, mockPuskesmas.phone)}
      onDone={onDone}
    />
  );
}

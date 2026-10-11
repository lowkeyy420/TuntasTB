import { copy } from "@/copy/family.id";
import { AppBar } from "@/components/ui";

/**
 * Frame of every family screen: the neutral strip, then one narrow column
 * that fills the height so a screen's main action can sit at the bottom.
 * Used by the real family route and by the mockups on the preview page.
 */
export function FamilyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar title={copy.appName} className="max-w-md" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4">{children}</div>
    </div>
  );
}

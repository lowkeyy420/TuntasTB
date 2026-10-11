/**
 * Next.js start-up hook (runs once when the server starts, Node runtime only).
 * Validates the rule files and stops the server with a clear error when they
 * are broken, instead of serving check-ins with a corrupted triage table.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertStartupRules } = await import("@/lib/startup");
    assertStartupRules();
  }
}

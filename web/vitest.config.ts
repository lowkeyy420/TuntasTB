import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Compiles JSX in component tests (tsconfig keeps `jsx: preserve` for Next).
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      // Safety-critical code must be fully exercised:
      //  - the reply filter, the last line of defence against unsafe generated
      //    text (family-reply 3.5);
      //  - the triage rules (add-triage-rules 2.7) and the risk score
      //    (add-dropout-risk-score 2.5), including the database-backed
      //    snapshot builder (needs TEST_DATABASE_URL);
      //  - the pickup date logic (add-pickup-planner 1.3).
      include: [
        "src/lib/reply/filter.ts",
        "src/lib/triage/**",
        "src/lib/risk/**",
        "src/lib/pickups/dates.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws when imported outside an RSC bundle; map it to the
      // package's own no-op so server modules can be unit tested under Node.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});

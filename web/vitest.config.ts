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
      // The reply filter is the last line of defence against unsafe generated
      // text: every line and branch must be exercised (family-reply 3.5).
      include: ["src/lib/reply/filter.ts"],
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

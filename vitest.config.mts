import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Each test starts its own in-memory Postgres, which can be slow on a busy machine or CI runner.
  test: { include: ["src/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});

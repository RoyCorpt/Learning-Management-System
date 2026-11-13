import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // DB integration files share a database; serialize them to avoid fixture races
    // such as the one-time Admin bootstrap running alongside Sprint 2 Admin fixtures.
    fileParallelism: process.env.RUN_DB_INTEGRATION !== '1',
  },
});

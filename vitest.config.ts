import { defineConfig } from "vitest/config";

const setupFiles = ["./test/setup/no-processes.ts"];

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "unit", include: ["test/unit/**/*.test.ts", "test/matrix/coverage.test.ts"], setupFiles },
      },
      {
        test: { name: "snapshot", include: ["test/snapshot/**/*.test.ts"], setupFiles },
      },
      {
        test: { name: "lint", include: ["test/lint/**/*.test.ts"], setupFiles },
      },
      // Real installs (network, package managers). Only via `npm run test:matrix`, never in `npm test`.
      ...(process.env.VITEST_MATRIX === "1"
        ? [{ test: { name: "matrix", include: ["test/matrix/matrix.test.ts"], testTimeout: 20 * 60 * 1000, fileParallelism: false } }]
        : []),
    ],
    passWithNoTests: true,
  },
});

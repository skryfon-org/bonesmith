import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
// bonesmith:vite-imports

export default defineConfig({
  plugins: [
    react(),
    // bonesmith:vite-plugins
  ],
  resolve: { tsconfigPaths: true },
  // bonesmith:vite-config
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      // bonesmith:vite-test-projects
    ],
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
// bonesmith:vite-imports

export default defineConfig({
  plugins: [
    react(),
    // bonesmith:vite-plugins
  ],
  resolve: { tsconfigPaths: true },
  lint: {
    ignorePatterns: ["dist/**", "coverage/**"],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: ["dist/**", "coverage/**"],
  },
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

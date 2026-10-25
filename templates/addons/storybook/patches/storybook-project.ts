{
  extends: true,
  plugins: [storybookTest({ configDir: ".storybook" })],
  test: {
    name: "storybook",
    browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" }] },
    setupFiles: [".storybook/vitest.setup.ts"],
  },
},

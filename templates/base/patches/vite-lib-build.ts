// Library build: ESM only, with type declarations from vite-plugin-dts.
build: {
  lib: { entry: "src/index.ts", formats: ["es"], fileName: "index", cssFileName: "styles" },
  rolldownOptions: { external },
  sourcemap: true,
},

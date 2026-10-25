// Library build (vp pack / tsdown): ESM + type declarations. `dependencies` and
// `peerDependencies` are kept external automatically.
pack: {
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  platform: "neutral",
  css: { fileName: "styles.css" },
},

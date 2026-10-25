import dts from "vite-plugin-dts";
import pkg from "./package.json" with { type: "json" };

// Peers (and their subpaths) stay out of the bundle; consumers provide them.
const peers = Object.keys((pkg as { peerDependencies?: Record<string, string> }).peerDependencies ?? {});
const external = (id: string) => id === "react/jsx-runtime" || peers.some((p) => id === p || id.startsWith(`${p}/`));

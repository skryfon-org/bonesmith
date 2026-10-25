export const tokens = {
  colors: { text: "#1f2328", surface: "#ffffff", border: "#d0d7de" },
  radius: "0.5rem",
  space: "1rem",
} as const;

export type Tokens = typeof tokens;

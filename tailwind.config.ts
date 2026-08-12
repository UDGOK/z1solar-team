import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#4CAB3E",
          greenDark: "#3F9634",
          greenTint: "#F5F9F3",
          ink: "#1C1C1C",
          inkSoft: "#3A3A3A",
          inkFaint: "#8A8A85",
          line: "#D8D8D2",
          amber: "#E8743B",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

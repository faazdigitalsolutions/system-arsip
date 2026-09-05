import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2c5e5b",
        "primary/50": "rgba(44,94,91,0.5)",
        "primary/10": "rgba(44,94,91,0.1)",
        "primary/25": "rgba(44,94,91,0.25)",
        "primary/90": "rgba(44,94,91,0.9)",
        accent: "#c9a96e",
        "accent/10": "rgba(201,169,110,0.1)",
        "accent/50": "rgba(201,169,110,0.5)",
        background: "#f8faf9",
        card: "#ffffff",
        "input-background": "#f1f5f4",
        border: "rgba(44,94,91,0.15)",
        foreground: "#1a2e2c",
        muted: "#f0f4f3",
      },
      fontFamily: {
        display: ["Playfair Display", "serif"],
        sans: ["DM Sans", "sans-serif"],
      },
      animation: {
        bounce: "bounce 1s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
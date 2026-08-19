/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,html}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Orbitron", "Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        // Orbitron 风格色板（与 mockup v7 一致）
        space: {
          900: "#02050f",
          800: "#050a1a",
        },
        accent: {
          DEFAULT: "#00d4ff",
          warm: "#ff8800",
        },
        ink: {
          DEFAULT: "#e0e8ff",
          muted: "#7080a0",
          dim: "#405070",
        },
      },
    },
  },
  plugins: [],
};

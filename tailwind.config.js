/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        alexa: { 50: "#ecfeff", 400: "#22d3ee", 500: "#06b6d4", 950: "#082f49" },
        panel: "#0b1726",
      },
      boxShadow: { glow: "0 0 40px rgba(34,211,238,.12)" },
    },
  },
  plugins: [],
};

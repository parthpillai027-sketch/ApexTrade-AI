/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        term: {
          bg: "#080b11",
          surface: "#0e131f",
          card: "#131b2e",
          border: "#1e293b",
          cyan: "#00e5ff",
          emerald: "#10b981",
          rose: "#f43f5e",
          amber: "#f59e0b"
        }
      }
    },
  },
  plugins: [],
}

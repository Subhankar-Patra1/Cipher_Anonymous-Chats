/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "var(--accent-green)",
        "accent-green": "#00FF00",
        "accent-purple": "#8A2BE2",
        "deep-charcoal": "#121217",
        "background-light": "#f5f6f8",
        "background-dark": "#121217",
      },
      fontFamily: {
        "sans": ['Inter', 'sans-serif'], // Keep Inter for main app? Or use Mono for landing? HTML uses font-mono on body.
        "display": ["Roboto Mono", "monospace"],
        "mono": ["Roboto Mono", "monospace"]
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg": "1rem",
        "xl": "2rem",
        "full": "9999px"
      },
    },
  },
  plugins: [],
}

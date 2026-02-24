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
        "deep-charcoal": "#1D1D21",
        "background-light": "#f5f6f8",
        "background-dark": "#1D1D21",
        "slate": {
          50: '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#ced4da',
          500: '#adb5bd',
          600: '#868e96',
          700: '#343a40',
          800: '#232326', // Neutral Panel
          900: '#17171A', // Neutral Sidebar
          950: '#1D1D21', // Neutral Background
        },
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

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: {
          50: '#f9f7f2',
          100: '#f2eee3',
          200: '#e6dec8',
          300: '#d6c6a5',
          400: '#c5ab81',
          500: '#b69262',
          600: '#a47c50',
          700: '#876342',
          800: '#70523a',
          900: '#5c4533',
        },
        ink: {
          900: '#1a1510',
          800: '#2c241b',
          700: '#4a3f33',
        },
        magic: {
          blue: '#3b82f6',
          purple: '#8b5cf6',
          gold: '#f59e0b',
          red: '#ef4444',
          green: '#10b981',
        }
      },
      fontFamily: {
        serif: ['"Merriweather"', '"Cinzel"', 'serif'],
        sans: ['"Inter"', 'sans-serif'],
      },
      backgroundImage: {
        'paper-texture': "url('https://www.transparenttextures.com/patterns/aged-paper.png')",
      }
    },
  },
  plugins: [],
}
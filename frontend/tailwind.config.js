/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '480px',
        // => @media (min-width: 480px) { ... }
      },
      animation: {
        'bounce-slow': 'bounce 3s linear infinite',
      },
      scrollbar: {
        'track': '#f1f1f1',
        'thumb': '#c1c1c1',
        'thumb-hover': '#a8a8a8',
        'corner': '#f1f1f1'
      }
    },
  },
  plugins: [
    require('tailwind-scrollbar'),
  ],
}
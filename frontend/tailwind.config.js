/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ink-black': '#04151f',
        'dark-slate': '#183a37',
        'wheat': '#efd6ac',
        'burnt-orange': '#c44900',
        'midnight-violet': '#432534',
      },
      fontFamily: {
        'songti': ['"Noto Serif SC"', 'SimSun', 'STSong', 'FangSong', 'serif'],
      },
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
      ,
      // 自定义最小高度，用于组件按钮统一样式
      minHeight: {
        'btn-mobile': '3rem',
        'btn-desktop': '3.5rem'
      }
    },
  },
  plugins: [
    require('tailwind-scrollbar'),
  ],
}
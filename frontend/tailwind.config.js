/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef4ff',
          100: '#d9e6ff',
          200: '#b3ccff',
          300: '#7ba6ff',
          400: '#4c82f7',
          500: '#2f63e0',
          600: '#224bb4',
          700: '#1b3a8c',
          800: '#162d6d',
          900: '#111f4f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

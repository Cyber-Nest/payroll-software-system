/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1F3A93',
        surface: '#F7F8FA',
        slateText: '#1F2933'
      }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#06101C',
        navy2: '#0E1B2E',
        panel: '#13243A',
        line: '#1C2C42',
        lime: '#8BC53F',
        lime2: '#A8DC57',
        steel: '#7E8B9B',
        steel2: '#A7B3C0',
        red: '#D34A3A',
        amber: '#E0A93B',
        green: '#3F9D52',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

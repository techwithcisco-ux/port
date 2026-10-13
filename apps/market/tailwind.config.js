/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ghana: { red: '#CE1126', gold: '#FCD116', green: '#006B3F', ink: '#1A1A2E' },
        kente: { indigo: '#2D1B69', orange: '#D4621B', teal: '#0E7C6B', maroon: '#7B1A2C' },
        cream: '#FEFDF5',
        sand: { 100: '#F7F2E3', 200: '#EFE8D2', 300: '#E8DFC4', 400: '#DCD2AF' },
        line: { DEFAULT: '#EAE3CE', strong: '#DBD2B4' },
        ink: { DEFAULT: '#1A1A2E', soft: '#4A4A5E', mute: '#7C7C8E', faint: '#A3A3B4' },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26,26,46,0.04), 0 2px 6px rgba(26,26,46,0.05)',
        card: '0 1px 2px rgba(26,26,46,0.05), 0 8px 24px -10px rgba(26,26,46,0.14)',
        lift: '0 12px 34px -12px rgba(26,26,46,0.24)',
        green: '0 10px 26px -12px rgba(0,107,63,0.7)',
        gold: '0 8px 26px -12px rgba(252,209,22,0.7)',
        ring: '0 0 0 4px rgba(0,107,63,0.12)',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pm: {
          bg: '#1c1c1c',
          'bg-s': '#212121',
          'bg-t': '#2c2c2c',
          'bg-input': '#1a1a1a',
          'bg-sidebar': '#1e1e1e',
          'bg-topbar': '#282828',
          hover: '#333333',
          active: '#3a3a3a',
          border: '#3a3a3a',
          'border-s': '#2e2e2e',
          'border-strong': '#4a4a4a',
          text: '#e8e8e8',
          'text-s': '#a0a0a0',
          'text-t': '#707070',
          orange: '#ff6c37',
          'orange-h': '#ff5722',
        },
        method: {
          get: '#61affe',
          post: '#49cc90',
          put: '#fca130',
          patch: '#50e3c2',
          delete: '#f93e3e',
          head: '#9012fe',
          options: '#0d5aa7',
        },
        st: {
          success: '#49cc90',
          warning: '#fca130',
          error: '#f93e3e',
          info: '#61affe',
        },
      },
      fontFamily: {
        sans: ['Lato', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['MonoLisa', '"Fira Code"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

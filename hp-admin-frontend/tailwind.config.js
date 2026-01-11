/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Home Productions Brand Colors
        brand: {
          gold: '#D4AF37',
          'gold-light': '#E8C547',
          'gold-dark': '#B8960C',
          green: '#0d1f1a',
          'green-light': '#1a3d32',
          'green-dark': '#050f0c',
          cream: '#F5F0E8',
          'cream-dark': '#E8E0D0',
        },
        // Status colors
        status: {
          pending: '#F59E0B',
          paid: '#10B981',
          cancelled: '#EF4444',
          refunded: '#6B7280',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pageBg: '#09090B',
        cardBg: 'rgba(17, 24, 39, 0.75)',
        secondaryBg: '#1F2937',
        accentBlue: '#2563EB',
        accentHover: '#1D4ED8',
        borderSubtle: 'rgba(255, 255, 255, 0.06)'
      },
      borderRadius: {
        btn: '12px',
        card: '20px'
      },
      backdropBlur: {
        premium: '16px'
      },
      boxShadow: {
        premium: '0 4px 30px rgba(0, 0, 0, 0.1)',
        glow: '0 0 15px rgba(37, 99, 235, 0.5)'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

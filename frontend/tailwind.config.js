/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pageBg: '#09090B',       // Zinc 950
        secondaryBg: '#111827',  // Gray 900
        cardBg: '#18181B',       // Zinc 900
        accentBlue: '#2563EB',   // Solid Blue
        borderSubtle: 'rgba(255, 255, 255, 0.06)'
      },
      borderRadius: {
        btn: '10px',
        card: '16px'
      },
      boxShadow: {
        subtle: '0 4px 12px -10px rgba(0, 0, 0, 0.5)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

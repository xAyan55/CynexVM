/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pageBg: '#0f0f0f',         // Base background canvas
        secondaryBg: '#111111',    // Sidebar background
        cardBg: '#1a1a1a',         // Card panel background
        inputBg: '#141414',        // Input background
        accentBlue: '#6366f1',     // Active brand accent (Indigo)
        accentHover: '#818cf8',    // Active brand accent hover
        borderSubtle: '#2a2a2a',   // Standard border line
        borderLessSubtle: 'rgba(255, 255, 255, 0.05)',
        textResting: '#a3a3a3',    // Default body text
        textStrong: '#f0f0f0',     // Bold headings and nav active text
        textMuted: '#666666',      // Subdued metadata
        blue: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1', // Main Indigo Brand
          600: '#4f46e5', // Hover/Active Indigo
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        }
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

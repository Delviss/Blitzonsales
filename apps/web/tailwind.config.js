/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        night: '#05090F',
        navy: '#070E18',
        navy2: '#0D1B2C',
        panel: '#0B1522',
        panel2: '#101F32',
        line: '#1B2C42',
        // Brand (from the BlitzON logo bolt: #08B8E7)
        brand: '#08B8E7',
        'brand-soft': '#3ACBF2',
        'brand-deep': '#0A85B8',
        // Ink
        ink: '#EAF3FA',
        steel: '#647A90',
        steel2: '#A9BDCE',
        // Status
        red: '#F0604D',
        amber: '#F2B33D',
        green: '#34C97C',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(8,184,231,0.25), 0 8px 40px -12px rgba(8,184,231,0.35)',
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 10px 30px -18px rgba(0,0,0,0.8)',
        pop: '0 20px 60px -20px rgba(0,0,0,0.85)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        'bolt-pulse': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.35s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
        'bolt-pulse': 'bolt-pulse 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

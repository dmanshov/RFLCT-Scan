import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // RFLCT brand colours — adjust to match rflct.be
        'brand-dark': '#0F1B2D',
        'brand-mid': '#1C2E45',
        'brand-gold': '#C9A050',
        'brand-gold-light': '#E4BC6B',
        'brand-off-white': '#F8F7F4',
        'brand-cream': '#F3EFE8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'spin-slow': { '0%': { strokeDashoffset: '440' }, '100%': { strokeDashoffset: '0' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pulse-ring': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'pulse-ring': 'pulse-ring 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;

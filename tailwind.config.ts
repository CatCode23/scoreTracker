import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      colors: {
        brand: { DEFAULT: '#1d3b2a', light: '#2f5c43', accent: '#c9a227' },
      },
    },
  },
  plugins: [],
} satisfies Config;

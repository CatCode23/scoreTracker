import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      colors: {
        // Palette taken from the WOTB logo. `brand` red is a shade deeper than the logo's
        // #EA1E27 so white text on it meets WCAG AA (5.4:1); `brand.bright` is the exact
        // logo red, for stripes/accents only (not behind text).
        brand: { DEFAULT: '#D3141D', dark: '#A3121A', bright: '#EA1E27' },
        ink: { DEFAULT: '#111111', soft: '#262626' },
        field: { DEFAULT: '#1A5333', light: '#236B43' },
        steel: '#C9CED6',
      },
    },
  },
  plugins: [],
} satisfies Config;

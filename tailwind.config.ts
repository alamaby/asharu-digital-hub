import type { Config } from 'tailwindcss';

/**
 * Color palette optimized for color-blind users (WCAG AA):
 * background #F8FAFC, surface #FFFFFF, ink #0F172A, muted #475569,
 * primary #075985 (hover #0C4A6E), accent #D97706 (decorative/large only),
 * line #CBD5E1, success #166534, danger #B91C1C, focus #2563EB.
 * Status is never communicated by color alone — always paired with text/icon.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F8FAFC',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#0F172A',
          muted: '#475569'
        },
        primary: {
          DEFAULT: '#075985',
          dark: '#0C4A6E'
        },
        accent: {
          DEFAULT: '#D97706',
          dark: '#B45309'
        },
        line: '#CBD5E1',
        success: '#166534',
        danger: '#B91C1C',
        focus: '#2563EB'
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.08)'
      },
      minHeight: {
        touch: '44px'
      },
      minWidth: {
        touch: '44px'
      }
    }
  },
  plugins: []
};

export default config;

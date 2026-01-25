import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Orakamoto brand colors
        brand: {
          primary: '#F7931A', // Bitcoin orange
          secondary: '#5546FF', // Stacks purple
          accent: '#00D4AA', // Teal accent for success/gains
        },
        // Dark theme
        dark: {
          bg: '#0D0D0F',
          card: '#16161A',
          border: '#242429',
          hover: '#1E1E24',
        },
        // Text colors
        text: {
          primary: '#FFFFFF',
          secondary: '#A0A0A8',
          muted: '#6B6B75',
        },
        // Status colors
        yes: '#00D4AA',
        no: '#FF6B6B',
        warning: '#FFB800',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #F7931A, 0 0 10px #F7931A' },
          '100%': { boxShadow: '0 0 10px #F7931A, 0 0 20px #F7931A' },
        },
      },
    },
  },
  plugins: [],
}
export default config

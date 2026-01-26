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
        // Bitcoin Heritage
        btc: {
          orange: '#F7931A',
          dark: '#E88612',
          glow: 'rgba(247, 147, 26, 0.4)',
        },
        // Terminal Green
        matrix: {
          green: '#00FF41',
          dark: '#03A062',
        },
        terminal: {
          green: '#00FF00',
          phosphor: '#4AF626',
          bg: '#0D0208',
        },
        // Cyberpunk Neon
        cyber: {
          cyan: '#00F7FF',
          magenta: '#FF00EA',
          yellow: '#FFCC00',
          cyanGlow: 'rgba(0, 247, 255, 0.5)',
          magentaGlow: 'rgba(255, 0, 234, 0.5)',
        },
        // Dark Backgrounds
        void: {
          black: '#050505',
        },
        dark: {
          navy: '#091833',
          card: '#16161A',
          border: '#242429',
          hover: '#1E1E24',
          bg: '#0D0208',
        },
        // Trading
        yes: '#00FF41',
        no: '#FF00EA',
        // Text - High contrast for readability
        text: {
          primary: '#FFFFFF',      // Headings
          secondary: '#E0E0E0',    // Lighter secondary text (was #B8B8B8)
          muted: '#A0A0A0',        // Lighter muted text (was #6B6B6B)
          bright: '#FFFFFF',       // Pure white for emphasis
        },
        // Legacy support
        brand: {
          primary: '#F7931A',
          secondary: '#5546FF',
          accent: '#00D4AA',
        },
        warning: '#FFB800',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        terminal: ['VT323', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-up': 'scaleUp 0.2s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'glitch-jerk': 'glitchJerk 0.3s linear infinite alternate',
        'scanline': 'scanline 8s linear infinite',
        'typing': 'typing 3s steps(30) 1s forwards',
        'blink-caret': 'blink-caret 0.75s step-end infinite',
        'flicker': 'flicker 3s infinite',
        'data-stream': 'data-stream 3s linear infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        'glitch-text': 'glitch-text 0.3s infinite',
        'holo-shimmer': 'holo-shimmer 3s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #00F7FF, 0 0 10px #00F7FF' },
          '100%': { boxShadow: '0 0 10px #00F7FF, 0 0 20px #00F7FF' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleUp: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(247, 147, 26, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(85, 70, 255, 0.5)' },
        },
        glitchJerk: {
          '0%': { clipPath: 'polygon(0 20%, 100% 20%, 100% 50%, 0 50%)', transform: 'translate(0)' },
          '50%': { clipPath: 'polygon(0 30%, 100% 30%, 100% 60%, 0 60%)', transform: 'translate(-2px)' },
          '100%': { clipPath: 'polygon(0 10%, 100% 10%, 100% 40%, 0 40%)', transform: 'translate(2px)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        typing: {
          'from': { width: '0' },
          'to': { width: '100%' },
        },
        'blink-caret': {
          'from, to': { borderColor: 'transparent' },
          '50%': { borderColor: '#00FF41' },
        },
        flicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1' },
          '20%, 24%, 55%': { opacity: '0.6' },
        },
        'data-stream': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        'glitch-text': {
          '0%': { textShadow: '2px 0 #FF00EA, -2px 0 #00F7FF' },
          '25%': { textShadow: '-2px 0 #FF00EA, 2px 0 #00F7FF' },
          '50%': { textShadow: '2px 0 #FF00EA, -2px 0 #00F7FF' },
          '75%': { textShadow: '-2px 0 #FF00EA, 2px 0 #00F7FF' },
          '100%': { textShadow: '2px 0 #FF00EA, -2px 0 #00F7FF' },
        },
        'holo-shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
    },
  },
  plugins: [],
}
export default config

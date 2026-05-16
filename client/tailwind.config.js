/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cortex: {
          bg: '#06070d',
          panel: '#0c1020',
          border: '#1c2340',
          accent: '#7cf3ff',
          ink: '#dbe5ff',
          dim: '#7a86ad',
          green: '#3ee892',
          yellow: '#ffd86b',
          red: '#ff5c7c',
          violet: '#a07bff',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(124, 243, 255, 0.18)',
        'glow-green': '0 0 30px rgba(62, 232, 146, 0.35)',
        'glow-yellow': '0 0 30px rgba(255, 216, 107, 0.35)',
        'glow-red': '0 0 30px rgba(255, 92, 124, 0.45)',
      },
      animation: {
        'pulse-slow': 'pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        flicker: 'flicker 3s linear infinite',
        'slide-up': 'slideUp 0.35s ease-out',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

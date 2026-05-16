/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // NVIDIA × Iron Man HUD palette
        carbon: {
          950: '#04050a',
          900: '#070912',
          800: '#0b0f1c',
          700: '#111626',
          600: '#1a2138',
          500: '#252e4a',
        },
        nv: {
          green: '#76B900', // NVIDIA brand green
          glow: '#9cf500',
          dim: '#4d7a00',
        },
        cortex: {
          bg: '#04050a',
          panel: '#0b0f1c',
          'panel-hi': '#111626',
          border: '#1a2138',
          'border-hi': '#252e4a',
          accent: '#7cf3ff',
          'accent-soft': '#5fd5e3',
          ink: '#e6ecff',
          dim: '#6e7aa3',
          'dim-hi': '#9aa6c9',
          green: '#76B900',
          'green-soft': '#9cf500',
          yellow: '#ffd86b',
          orange: '#ff9a3c',
          red: '#ff5c7c',
          violet: '#a07bff',
          'violet-soft': '#c8b3ff',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Cinematic glows
        'glow-sm': '0 0 16px rgba(124, 243, 255, 0.18)',
        glow: '0 0 32px rgba(124, 243, 255, 0.22)',
        'glow-lg': '0 0 60px rgba(124, 243, 255, 0.25)',
        'glow-nv': '0 0 30px rgba(118, 185, 0, 0.45)',
        'glow-green': '0 0 30px rgba(62, 232, 146, 0.35)',
        'glow-yellow': '0 0 30px rgba(255, 216, 107, 0.35)',
        'glow-red': '0 0 30px rgba(255, 92, 124, 0.45)',
        'glow-violet': '0 0 30px rgba(160, 123, 255, 0.45)',
        'inset-hairline': 'inset 0 0 0 1px rgba(124, 243, 255, 0.08)',
      },
      backgroundImage: {
        'hud-grid':
          'linear-gradient(rgba(124, 243, 255, 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(124, 243, 255, 0.045) 1px, transparent 1px)',
        'hud-radial':
          'radial-gradient(circle at 20% 0%, rgba(118, 185, 0, 0.08), transparent 50%), radial-gradient(circle at 100% 100%, rgba(124, 243, 255, 0.07), transparent 55%)',
      },
      animation: {
        'pulse-slow': 'pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        scan: 'scan 4s linear infinite',
        ticker: 'ticker 24s linear infinite',
        glow: 'glow 2.6s ease-in-out infinite alternate',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        glow: {
          '0%': { opacity: '0.6' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nova: {
          bg: '#030712',
          surface: '#070d1e',
          card: 'rgba(11, 20, 38, 0.7)',
          border: 'rgba(0, 240, 255, 0.18)',
          hover: 'rgba(0, 240, 255, 0.08)',
          cyan: '#00f0ff',
          neon: '#06b6d4',
          blue: '#3b82f6',
          deep: '#020617',
          gold: '#f59e0b',
          danger: '#ef4444',
          success: '#10b981'
        }
      },
      fontFamily: {
        sans: ['Rajdhani', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Orbitron', 'sans-serif']
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(0, 240, 255, 0.35)',
        'neon-blue': '0 0 20px rgba(59, 130, 246, 0.35)',
        'neon-pulse': '0 0 35px rgba(0, 240, 255, 0.6)',
        'neon-subtle': '0 0 10px rgba(0, 240, 255, 0.15)'
      },
      animation: {
        'spin-slow': 'spin 18s linear infinite',
        'spin-reverse-slow': 'spin-reverse 24s linear infinite',
        'pulse-glow': 'pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        'spin-reverse': {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' }
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.9', filter: 'drop-shadow(0 0 15px rgba(0,240,255,0.4))' },
          '50%': { opacity: '0.4', filter: 'drop-shadow(0 0 5px rgba(0,240,255,0.2))' }
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' }
        }
      }
    },
  },
  plugins: [],
}

/**
 * @file tailwind.config.js
 * @module TailwindConfig
 * @description Tailwind CSS configuration for Aetheris 4D.
 *              Extends default theme with Aetheris design tokens,
 *              custom fonts (Space Mono, Chakra Petch), and glassmorphic utilities.
 * @author Aetheris 4D
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        display: ['"Chakra Petch"', 'sans-serif'],
      },
      colors: {
        aetheris: {
          void: '#050810',
          plasma: '#00FFFF',
          solar: '#FF6B35',
          storm: '#7B2FBE',
          ice: '#B8E4FF',
          glass: 'rgba(255,255,255,0.06)',
        },
      },
      backdropBlur: {
        xs: '4px',
        panel: '12px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        'plasma-glow': '0 0 20px rgba(0,255,255,0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};

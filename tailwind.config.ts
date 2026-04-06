/**
 * @module tailwind.config
 * @description Tailwind CSS configuration — migrated from CDN to local compilation.
 *
 * VULN: The previous CDN approach (cdn.tailwindcss.com) exposed the project
 * to supply chain attacks without Subresource Integrity (SRI).
 * Local compilation eliminates this risk and improves performance by:
 * - Removing render-blocking CDN script
 * - Tree-shaking unused utilities
 * - Enabling JIT compilation
 *
 * Reference: Tailwind CSS v3 Installation Guide
 * https://tailwindcss.com/docs/installation/using-postcss
 */

import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './modules/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        // Extra breakpoints for large & ultra-wide monitors (27"–32"+)
        '3xl': '1920px',
        '4xl': '2560px',
      },
      fontFamily: {
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'float-up': 'float-up 2s ease-out forwards',
        'slide-in': 'slide-in 0.3s ease-out forwards',
        shrink: 'shrink linear forwards',
        'fade-in-out': 'fade-in-out 3s ease-out forwards',
        'sound-wave-1': 'sound-wave-1 0.5s ease-in-out infinite',
        'sound-wave-2': 'sound-wave-2 0.5s ease-in-out infinite 0.1s',
        'sound-wave-3': 'sound-wave-3 0.5s ease-in-out infinite 0.2s',
        'slide-down': 'slide-down 0.3s ease-out forwards',
        wave: 'wave-bounce 0.5s ease-in-out 3',
        'emoji-popup': 'emoji-popup 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'emoji-float': 'emoji-float-2026 2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'chat-bubble': 'chat-bubble-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        'float-up': {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(-100px) scale(1.5)', opacity: '0' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shrink: {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        },
        'fade-in-out': {
          '0%': { opacity: '0', transform: 'translate(-50%, -50%) scale(0.5)' },
          '15%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1.1)' },
          '30%': { transform: 'translate(-50%, -50%) scale(1)' },
          '70%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translate(-50%, -50%) scale(0.8)' },
        },
        'sound-wave-1': {
          '0%, 100%': { height: '12px' },
          '50%': { height: '6px' },
        },
        'sound-wave-2': {
          '0%, 100%': { height: '16px' },
          '50%': { height: '8px' },
        },
        'sound-wave-3': {
          '0%, 100%': { height: '8px' },
          '50%': { height: '14px' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'wave-bounce': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(20deg)' },
          '75%': { transform: 'rotate(-20deg)' },
        },
        'emoji-popup': {
          '0%': { opacity: '0', transform: 'translate(-50%, 8px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0) scale(1)' },
        },
        'emoji-float-2026': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0px)' },
          '50%': { opacity: '1', transform: 'translateY(-40px) scale(1.3)', filter: 'blur(0px)' },
          '100%': { opacity: '0', transform: 'translateY(-80px) scale(0.8)', filter: 'blur(2px)' },
        },
        'chat-bubble-in': {
          '0%': { opacity: '0', transform: 'scale(0.8) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

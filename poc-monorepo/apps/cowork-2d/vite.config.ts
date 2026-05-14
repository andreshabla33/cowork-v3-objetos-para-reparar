/**
 * @file vite.config.ts — Vite 6 config para cowork-2d (POC).
 *
 * Doc: https://vite.dev/config/
 * React plugin: https://github.com/vitejs/vite-plugin-react
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Workspace package: no pre-bundling, dejá que Vite lo sirva desde source TS.
  optimizeDeps: {
    exclude: ['@cowork/core-shared'],
  },
  // POC standalone: no heredar PostCSS/Tailwind del proyecto padre (v3.7).
  css: { postcss: {} },
  server: {
    port: 5174,
    open: false,
  },
  build: {
    sourcemap: true,
    target: 'es2022',
  },
});

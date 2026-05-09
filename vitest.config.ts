import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Aliases específicos primero (precedencia sobre el catch-all @/*).
      // Sincronizado con vite.config.ts — sin esto vitest resuelve
      // @/modules/realtime-room al shim legacy en /modules/, no a src/modules/.
      '@/core': path.resolve(__dirname, './src/core'),
      '@/modules': path.resolve(__dirname, './src/modules'),
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./tests/setup/vitest-env.ts'],
  },
});

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 2300,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (id.includes('/three/') || id.includes('three-stdlib') || id.includes('troika-') || id.includes('camera-controls')) {
              return 'vendor-three';
            }

            if (id.includes('@react-three') || id.includes('@use-gesture') || id.includes('maath') || id.includes('meshline') || id.includes('suspend-react') || id.includes('stats-gl')) {
              return 'vendor-r3f';
            }

            if (id.includes('@dimforge/rapier3d') || id.includes('@react-three/rapier')) {
              return 'vendor-physics';
            }

            if (id.includes('livekit-client') || id.includes('@livekit')) {
              return 'vendor-livekit';
            }

            if (id.includes('@mediapipe')) {
              return 'vendor-mediapipe';
            }

            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }

            if (id.includes('/phaser/')) {
              return 'vendor-phaser';
            }

            if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('driver.js')) {
              return 'vendor-ui';
            }

            return 'vendor-core';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});

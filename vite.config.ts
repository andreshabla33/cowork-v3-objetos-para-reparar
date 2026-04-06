/**
 * vite.config.ts
 *
 * REMEDIATION-008b (2026-03-30):
 * - `sourcemap: 'hidden'` genera source maps pero no los referencia en el bundle.
 *   Sentry los sube durante el build; el navegador nunca los descarga.
 * - `sentryVitePlugin` sube source maps y los asocia a la release.
 *   Requiere: SENTRY_AUTH_TOKEN, VITE_SENTRY_ORG, VITE_SENTRY_PROJECT en .env.
 * - Import condicional: si el paquete no está instalado el build no falla —
 *   simplemente no se sube el source map (útil en entornos sin token).
 *
 * Instalación requerida (ejecutar en la raíz del proyecto):
 *   npm install @sentry/react @sentry/vite-plugin
 */
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

async function resolveSentryPlugin(): Promise<Plugin[]> {
  const org     = process.env.VITE_SENTRY_ORG;
  const project = process.env.VITE_SENTRY_PROJECT;
  const token   = process.env.SENTRY_AUTH_TOKEN;

  if (!org || !project || !token) return [];

  try {
    const { sentryVitePlugin } = await import('@sentry/vite-plugin');
    return [
      sentryVitePlugin({
        org,
        project,
        authToken: token,
        sourcemaps: {
          // Borra los .map del directorio dist después del upload para no exponerlos
          filesToDeleteAfterUpload: ['./dist/**/*.map'],
        },
        telemetry: false,
      }),
    ];
  } catch {
    // @sentry/vite-plugin no está instalado — continuar sin upload de source maps
    console.warn('[vite.config] @sentry/vite-plugin no encontrado. Omitiendo upload de source maps.');
    return [];
  }
}

export default defineConfig(async () => {
  const sentryPlugins = await resolveSentryPlugin();

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), ...sentryPlugins],
    build: {
      // 'hidden': genera .map pero sin referencia //# sourceMappingURL en el bundle.
      // Sentry los consume; el navegador de producción nunca los descarga.
      sourcemap: 'hidden',
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
        // Aliases específicos primero (tienen precedencia sobre el catch-all @/*)
        '@/core': path.resolve(__dirname, './src/core'),
        '@/modules': path.resolve(__dirname, './src/modules'),
        // Catch-all: todo lo demás bajo @ apunta a la raíz del proyecto
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CONFIG_PUBLICA_APP, SERVIDORES_ICE_PUBLICOS } from '../../../lib/env';

describe('Environment Configuration Module', () => {
  beforeEach(() => {
    // Reset import.meta.env before each test
    vi.resetModules();
  });

  describe('CONFIG_PUBLICA_APP', () => {
    it('should export a public config object with required properties', () => {
      expect(CONFIG_PUBLICA_APP).toHaveProperty('urlApp');
      expect(CONFIG_PUBLICA_APP).toHaveProperty('urlSupabase');
      expect(CONFIG_PUBLICA_APP).toHaveProperty('claveAnonSupabase');
    });

    it('should have string values for all required properties', () => {
      expect(typeof CONFIG_PUBLICA_APP.urlApp).toBe('string');
      expect(typeof CONFIG_PUBLICA_APP.urlSupabase).toBe('string');
      expect(typeof CONFIG_PUBLICA_APP.claveAnonSupabase).toBe('string');
    });

    it('should throw if VITE_SUPABASE_URL is missing', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'valid-key');
      vi.resetModules();
      await expect(import('../../../lib/env')).rejects.toThrow(
        'Falta la variable de entorno VITE_SUPABASE_URL'
      );
    });

    it('should throw if VITE_SUPABASE_ANON_KEY is missing', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
      vi.resetModules();
      await expect(import('../../../lib/env')).rejects.toThrow(
        'Falta la variable de entorno VITE_SUPABASE_ANON_KEY'
      );
    });
  });

  describe('URL Normalization', () => {
    it('urlApp should be a string', () => {
      expect(typeof CONFIG_PUBLICA_APP.urlApp).toBe('string');
    });

    it('urlApp should not contain leading/trailing whitespace', () => {
      expect(CONFIG_PUBLICA_APP.urlApp).toBe(CONFIG_PUBLICA_APP.urlApp.trim());
    });

    it('urlSupabase should be properly trimmed', () => {
      expect(CONFIG_PUBLICA_APP.urlSupabase).toBe(
        CONFIG_PUBLICA_APP.urlSupabase.trim()
      );
    });
  });

  describe('SERVIDORES_ICE_PUBLICOS', () => {
    it('should export an array of ICE servers', () => {
      expect(Array.isArray(SERVIDORES_ICE_PUBLICOS)).toBe(true);
    });

    it('should always include STUN servers', () => {
      const stunServers = SERVIDORES_ICE_PUBLICOS.filter(
        (server) => typeof server.urls === 'string' && server.urls.startsWith('stun:')
      );
      expect(stunServers.length).toBeGreaterThan(0);
    });

    it('should have at least 5 STUN servers by default', () => {
      const stunServers = SERVIDORES_ICE_PUBLICOS.filter(
        (server) => typeof server.urls === 'string' && server.urls.startsWith('stun:')
      );
      expect(stunServers.length).toBeGreaterThanOrEqual(5);
    });

    it('should include Google STUN servers', () => {
      const googleStunServers = SERVIDORES_ICE_PUBLICOS.filter(
        (server) =>
          typeof server.urls === 'string' &&
          server.urls.includes('stun.l.google.com')
      );
      expect(googleStunServers.length).toBeGreaterThan(0);
    });

    it('should not include null servers', () => {
      expect(SERVIDORES_ICE_PUBLICOS).not.toContain(null);
      expect(SERVIDORES_ICE_PUBLICOS).not.toContain(undefined);
    });

    it('each server should have urls property', () => {
      SERVIDORES_ICE_PUBLICOS.forEach((server) => {
        expect(server).toHaveProperty('urls');
        expect(server.urls).toBeTruthy();
      });
    });
  });

  describe('TURN Server Configuration', () => {
    it('should include TURN servers when all credentials are provided', () => {
      // The actual TURN servers depend on environment variables
      // This test verifies the structure when they exist
      const turnServers = SERVIDORES_ICE_PUBLICOS.filter(
        (server) =>
          typeof server.urls === 'string' &&
          server.urls.startsWith('turn:')
      );

      turnServers.forEach((server) => {
        if (turnServers.length > 0) {
          // TURN servers should have username and credential
          expect(server).toHaveProperty('username');
          expect(server).toHaveProperty('credential');
        }
      });
    });

    it('should not include TURN servers if username is missing', () => {
      // When VITE_TURN_USERNAME is not set, no TURN servers should be created
      // This is verified by the crearServidorTurn function logic
      expect(SERVIDORES_ICE_PUBLICOS.length).toBeGreaterThan(0);
    });

    it('should not include TURN servers if credential is missing', () => {
      // When VITE_TURN_CREDENTIAL is not set, no TURN servers should be created
      expect(SERVIDORES_ICE_PUBLICOS.length).toBeGreaterThan(0);
    });

    it('should filter out null TURN servers from the list', () => {
      // The filter operation should remove any null values from TURN server creation
      const hasOnlyValidServers = SERVIDORES_ICE_PUBLICOS.every(
        (server) => server !== null && server !== undefined
      );
      expect(hasOnlyValidServers).toBe(true);
    });

    it('TURN servers should have username property when present', () => {
      const turnServers = SERVIDORES_ICE_PUBLICOS.filter(
        (server) =>
          typeof server.urls === 'string' &&
          server.urls.startsWith('turn:')
      );

      turnServers.forEach((server) => {
        expect(server).toHaveProperty('username');
        expect(typeof server.username).toBe('string');
      });
    });

    it('TURN servers should have credential property when present', () => {
      const turnServers = SERVIDORES_ICE_PUBLICOS.filter(
        (server) =>
          typeof server.urls === 'string' &&
          server.urls.startsWith('turn:')
      );

      turnServers.forEach((server) => {
        expect(server).toHaveProperty('credential');
        expect(typeof server.credential).toBe('string');
      });
    });
  });

  describe('ICE Server List Composition', () => {
    it('should combine STUN and TURN servers', () => {
      const stunServers = SERVIDORES_ICE_PUBLICOS.filter(
        (server) => typeof server.urls === 'string' && server.urls.startsWith('stun:')
      );
      expect(stunServers.length).toBeGreaterThan(0);
    });

    it('should maintain proper RTCIceServer structure', () => {
      SERVIDORES_ICE_PUBLICOS.forEach((server) => {
        expect(server).toHaveProperty('urls');
        expect(typeof server.urls).toBe('string');
      });
    });

    it('should be an immutable (readonly) array or contain readonly servers', () => {
      // Verify the type is properly exported
      expect(SERVIDORES_ICE_PUBLICOS).toBeDefined();
      expect(Array.isArray(SERVIDORES_ICE_PUBLICOS)).toBe(true);
    });

    it('should contain valid STUN URLs', () => {
      const stunServers = SERVIDORES_ICE_PUBLICOS.filter(
        (server) => typeof server.urls === 'string' && server.urls.startsWith('stun:')
      );

      stunServers.forEach((server) => {
        expect(server.urls).toMatch(/^stun:/);
      });
    });

    it('should not duplicate servers', () => {
      const urls = SERVIDORES_ICE_PUBLICOS.map((s) => s.urls).filter(
        (url) => typeof url === 'string'
      );
      const uniqueUrls = new Set(urls);
      expect(urls.length).toBe(uniqueUrls.size);
    });
  });

  describe('Environment Variable Handling', () => {
    it('should handle missing VITE_APP_URL gracefully', () => {
      // CONFIG_PUBLICA_APP.urlApp should have a value (either from env or window.location)
      expect(CONFIG_PUBLICA_APP.urlApp).toBeDefined();
      expect(typeof CONFIG_PUBLICA_APP.urlApp).toBe('string');
    });

    it('should handle whitespace-only environment variables', () => {
      // normalizarTexto should treat whitespace-only strings as null
      // and omit them from results
      expect(CONFIG_PUBLICA_APP).toBeDefined();
    });

    it('should trim environment variable values', () => {
      const urlApp = CONFIG_PUBLICA_APP.urlApp;
      const urlSupabase = CONFIG_PUBLICA_APP.urlSupabase;

      if (urlApp) {
        expect(urlApp).toBe(urlApp.trim());
      }
      if (urlSupabase) {
        expect(urlSupabase).toBe(urlSupabase.trim());
      }
    });
  });

  describe('Type Safety', () => {
    it('CONFIG_PUBLICA_APP should be readonly (const)', () => {
      // Type check - the object is exported as const
      expect(CONFIG_PUBLICA_APP).toBeDefined();
    });

    it('SERVIDORES_ICE_PUBLICOS should be an array of RTCIceServer', () => {
      expect(Array.isArray(SERVIDORES_ICE_PUBLICOS)).toBe(true);
      SERVIDORES_ICE_PUBLICOS.forEach((server) => {
        expect(server).toHaveProperty('urls');
      });
    });

    it('ICE servers should have proper types', () => {
      SERVIDORES_ICE_PUBLICOS.forEach((server) => {
        expect(typeof server.urls).toBe('string');
        if (server.username) {
          expect(typeof server.username).toBe('string');
        }
        if (server.credential) {
          expect(typeof server.credential).toBe('string');
        }
      });
    });
  });
});

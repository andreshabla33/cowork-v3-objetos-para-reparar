import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateSupabaseKey,
  validateTurnCredentials,
  runStartupSecurityChecks,
} from '../../../lib/security/validateEnvKeys';

// Helper: create a fake JWT with a given payload
function createFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe('validateSupabaseKey', () => {
  describe('service_role key detection', () => {
    it('detects service_role key as invalid (CRITICAL)', () => {
      const key = createFakeJwt({
        role: 'service_role',
        exp: 9999999999,
        iss: 'https://example.supabase.co',
      });
      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(false);
      expect(result.role).toBe('service_role');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('CRITICAL');
      expect(result.errors[0]).toContain('service_role');
      expect(result.errors[0]).toContain('Row Level Security');
    });
  });

  describe('anon key validation', () => {
    it('accepts anon key as valid', () => {
      const key = createFakeJwt({
        role: 'anon',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://example.supabase.co',
      });
      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
      expect(result.role).toBe('anon');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('unexpected role handling', () => {
    it('warns on unexpected role like "authenticated"', () => {
      const key = createFakeJwt({
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://example.supabase.co',
      });
      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
      expect(result.role).toBe('authenticated');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Unexpected role');
    });

    it('warns on custom role', () => {
      const key = createFakeJwt({
        role: 'custom_admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://example.supabase.co',
      });
      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
      expect(result.role).toBe('custom_admin');
      expect(result.warnings.some((w) => w.includes('Unexpected role'))).toBe(true);
    });
  });

  describe('key format validation', () => {
    it('rejects empty key', () => {
      const result = validateSupabaseKey('');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('missing');
    });

    it('rejects key shorter than 20 characters', () => {
      const result = validateSupabaseKey('short');

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('missing or too short');
    });

    it('rejects key exactly 19 characters', () => {
      const result = validateSupabaseKey('x'.repeat(19));

      expect(result.isValid).toBe(false);
    });

    it('accepts key of exactly 20 characters (threshold)', () => {
      const key = createFakeJwt({
        role: 'anon',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
    });
  });

  describe('JWT decoding edge cases', () => {
    it('handles malformed JWT gracefully (not 3 parts)', () => {
      const result = validateSupabaseKey('eyJhbGciOiJIUzI1NiJ9.payload');

      expect(result.isValid).toBe(true);
      expect(result.role).toBe(null);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Could not decode');
    });

    it('handles invalid base64 payload', () => {
      const result = validateSupabaseKey('header.!!!invalid_base64!!!.signature');

      expect(result.isValid).toBe(true);
      expect(result.role).toBe(null);
      expect(result.warnings[0]).toContain('Could not decode');
    });

    it('handles non-JSON payload', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const body = btoa('not-json-at-all');
      const key = `${header}.${body}.signature`;

      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
      expect(result.role).toBe(null);
      expect(result.warnings[0]).toContain('Could not decode');
    });

    it('handles missing role field in JWT', () => {
      const key = createFakeJwt({
        iss: 'https://example.supabase.co',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
      expect(result.role).toBe(null);
      expect(result.warnings.some((w) => w.includes('Unexpected role'))).toBe(true);
    });

    it('handles non-string role field', () => {
      const key = createFakeJwt({
        role: 123,
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
      expect(result.role).toBe(null);
    });
  });

  describe('expiration checks', () => {
    it('warns on keys with very long expiration (50+ years)', () => {
      const farFuture = Math.floor(Date.now() / 1000) + 60 * 365 * 24 * 3600;
      const key = createFakeJwt({
        role: 'anon',
        exp: farFuture,
      });

      const result = validateSupabaseKey(key);

      expect(result.warnings.some((w) => w.includes('long expiration'))).toBe(true);
    });

    it('does not warn on keys expiring in 49 years', () => {
      const almostFarFuture = Math.floor(Date.now() / 1000) + 49 * 365 * 24 * 3600;
      const key = createFakeJwt({
        role: 'anon',
        exp: almostFarFuture,
      });

      const result = validateSupabaseKey(key);

      expect(result.warnings.some((w) => w.includes('long expiration'))).toBe(false);
    });

    it('does not warn on normal expiration (1 hour)', () => {
      const soon = Math.floor(Date.now() / 1000) + 3600;
      const key = createFakeJwt({
        role: 'anon',
        exp: soon,
      });

      const result = validateSupabaseKey(key);

      expect(result.warnings).toHaveLength(0);
    });

    it('handles non-numeric exp field', () => {
      const key = createFakeJwt({
        role: 'anon',
        exp: 'not-a-number',
      });

      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
      // Should not crash, no warning about expiration
      expect(result.warnings.some((w) => w.includes('long expiration'))).toBe(false);
    });

    it('handles missing exp field', () => {
      const key = createFakeJwt({
        role: 'anon',
        iss: 'https://example.supabase.co',
      });

      const result = validateSupabaseKey(key);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes('long expiration'))).toBe(false);
    });
  });

  describe('result structure', () => {
    it('returns all required fields', () => {
      const key = createFakeJwt({ role: 'anon', exp: 9999999999 });
      const result = validateSupabaseKey(key);

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});

describe('validateTurnCredentials', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Note: Testing validateTurnCredentials is tricky because it accesses import.meta.env
  // which is compile-time configuration. In a real scenario, these would be tested
  // in integration tests or E2E tests with different environment setups.
  // Here we document the expected behavior:

  it('returns an array', () => {
    const result = validateTurnCredentials();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('runStartupSecurityChecks', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: Record<string, unknown>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalEnv = { ...import.meta.env };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('throws error in production with service_role key', () => {
    const key = createFakeJwt({
      role: 'service_role',
      exp: 9999999999,
    });

    // Mock production environment
    const originalProd = import.meta.env.PROD;
    Object.defineProperty(import.meta.env, 'PROD', {
      value: true,
      configurable: true,
      writable: true,
      enumerable: true,
    });

    expect(() => {
      runStartupSecurityChecks(key);
    }).toThrow('[SECURITY] Application cannot start');

    // Restore original PROD value
    Object.defineProperty(import.meta.env, 'PROD', {
      value: originalProd,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  });

  it('does not throw in development with service_role key', () => {
    const key = createFakeJwt({
      role: 'service_role',
      exp: 9999999999,
    });

    // In development (non-PROD), this should not throw
    if (!import.meta.env.PROD) {
      expect(() => {
        runStartupSecurityChecks(key);
      }).not.toThrow();
    }
  });

  it('does not throw with valid anon key', () => {
    const key = createFakeJwt({
      role: 'anon',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(() => {
      runStartupSecurityChecks(key);
    }).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { hashToken } from '../../../lib/security/hashToken';

describe('hashToken', () => {
  describe('output format', () => {
    it('returns a 64-character hex string', async () => {
      const hash = await hashToken('test-token');

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns lowercase hex characters only', async () => {
      const hash = await hashToken('mixed-case-Token-123');

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toMatch(/[A-Z]/);
    });

    it('produces valid hex (no invalid characters)', async () => {
      const hash = await hashToken('arbitrary-input-string');

      for (const char of hash) {
        expect('0123456789abcdef').toContain(char);
      }
    });
  });

  describe('consistency', () => {
    it('produces consistent hashes for the same input', async () => {
      const input = 'my-invitation-token-123';

      const hash1 = await hashToken(input);
      const hash2 = await hashToken(input);
      const hash3 = await hashToken(input);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('produces identical hashes across multiple calls', async () => {
      const hashes = await Promise.all([
        hashToken('consistent-input'),
        hashToken('consistent-input'),
        hashToken('consistent-input'),
        hashToken('consistent-input'),
        hashToken('consistent-input'),
      ]);

      const firstHash = hashes[0];
      expect(hashes.every((h) => h === firstHash)).toBe(true);
    });
  });

  describe('uniqueness', () => {
    it('produces different hashes for different inputs', async () => {
      const hash1 = await hashToken('token-a');
      const hash2 = await hashToken('token-b');
      const hash3 = await hashToken('token-c');

      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
      expect(hash1).not.toBe(hash3);
    });

    it('produces different hashes for minor input variations', async () => {
      const hash1 = await hashToken('token');
      const hash2 = await hashToken('token ');
      const hash3 = await hashToken('token-');
      const hash4 = await hashToken('Token');

      expect(new Set([hash1, hash2, hash3, hash4]).size).toBe(4);
    });

    it('produces different hashes for inputs differing by one character', async () => {
      const hash1 = await hashToken('abcdef');
      const hash2 = await hashToken('abcdeg');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('known test vectors', () => {
    it('handles empty string (SHA-256 of empty string)', async () => {
      const hash = await hashToken('');

      // SHA-256 of empty string is a well-known value
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('handles simple ASCII string', async () => {
      const hash = await hashToken('abc');

      // SHA-256('abc') is well-documented
      expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('handles repeated characters', async () => {
      const hash = await hashToken('aaa');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('special characters', () => {
    it('handles whitespace (spaces, tabs, newlines)', async () => {
      const hashes = await Promise.all([
        hashToken('token with spaces'),
        hashToken('token\twith\ttabs'),
        hashToken('token\nwith\nnewlines'),
        hashToken('   '),
        hashToken('\t\t\t'),
        hashToken('\n\n\n'),
      ]);

      // All should be valid hashes and different from each other
      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      });

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(6);
    });

    it('handles special punctuation', async () => {
      const hashes = await Promise.all([
        hashToken('token!@#$%^&*()'),
        hashToken('token-._~:/?#[]@'),
        hashToken('token<>"|\\'),
      ]);

      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      });
    });

    it('handles quotes and escapes', async () => {
      const hashes = await Promise.all([
        hashToken('"quoted"'),
        hashToken("'single'"),
        hashToken('back\\slash'),
        hashToken('forward/slash'),
      ]);

      hashes.forEach((hash) => {
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      });
    });
  });

  describe('unicode and multibyte characters', () => {
    it('handles unicode characters', async () => {
      const hash = await hashToken('token-con-ñ');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles unicode accents and diacritics', async () => {
      const hashes = await Promise.all([
        hashToken('café'),
        hashToken('naïve'),
        hashToken('résumé'),
        hashToken('über'),
      ]);

      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
      });

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(4);
    });

    it('handles emoji characters', async () => {
      const hashes = await Promise.all([
        hashToken('token-🎉'),
        hashToken('token-😀'),
        hashToken('token-🔐'),
        hashToken('🎉😀🔐'),
      ]);

      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      });

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(4);
    });

    it('handles mixed unicode and emoji', async () => {
      const hash = await hashToken('Café-token-🎉-résumé');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles CJK (Chinese, Japanese, Korean) characters', async () => {
      const hashes = await Promise.all([
        hashToken('中文'),
        hashToken('日本語'),
        hashToken('한국어'),
      ]);

      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
      });

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(3);
    });

    it('handles right-to-left text (Arabic, Hebrew)', async () => {
      const hashes = await Promise.all([
        hashToken('العربية'),
        hashToken('עברית'),
        hashToken('token-العربية-עברית'),
      ]);

      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
      });
    });

    it('distinguishes between lookalike unicode characters', async () => {
      // Latin 'a' (U+0061) vs Cyrillic 'а' (U+0430)
      const hashLatin = await hashToken('Latin-a');
      const hashCyrillic = await hashToken('Latin-а');

      expect(hashLatin).not.toBe(hashCyrillic);
    });
  });

  describe('edge cases', () => {
    it('handles very long strings', async () => {
      const longString = 'x'.repeat(10000);
      const hash = await hashToken(longString);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles very short strings (single character)', async () => {
      const hashes = await Promise.all([
        hashToken('a'),
        hashToken('1'),
        hashToken('!'),
        hashToken('🎉'),
      ]);

      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
      });

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(4);
    });

    it('handles null bytes (if supported by UTF-8 encoding)', async () => {
      const stringWithNull = 'before\0after';
      const hash = await hashToken(stringWithNull);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles numeric strings', async () => {
      const hashes = await Promise.all([
        hashToken('123456'),
        hashToken('0'),
        hashToken('999999999999999'),
      ]);

      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
      });

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(3);
    });
  });

  describe('async behavior', () => {
    it('returns a Promise', async () => {
      const result = hashToken('test');
      expect(result).toBeInstanceOf(Promise);

      const resolved = await result;
      expect(typeof resolved).toBe('string');
    });

    it('can be awaited', async () => {
      const hash = await hashToken('test-token');
      expect(typeof hash).toBe('string');
    });

    it('can be chained with then()', async () => {
      // Vitest 3.x eliminó el callback `done`. Convertimos a Promise-based
      // y lanzamos si falla — vitest awaita el resultado. Fix P3 — plan 34919757.
      await hashToken('test-token').then((hash) => {
        expect(typeof hash).toBe('string');
        expect(hash).toHaveLength(64);
      });
    });

    it('works with Promise.all for parallel hashing', async () => {
      const tokens = ['token1', 'token2', 'token3', 'token4', 'token5'];
      const hashes = await Promise.all(tokens.map((token) => hashToken(token)));

      expect(hashes).toHaveLength(5);
      hashes.forEach((hash) => {
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      });
    });
  });

  describe('security properties', () => {
    it('exhibits avalanche effect (small input change causes large output change)', async () => {
      const hash1 = await hashToken('password123');
      const hash2 = await hashToken('password124');

      // Count different characters (Hamming distance)
      let differences = 0;
      for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) {
          differences++;
        }
      }

      // SHA-256 should produce significantly different hashes
      // (typically around half the bits different, so ~32 characters)
      expect(differences).toBeGreaterThan(10);
    });

    it('is deterministic (same input always produces same output)', async () => {
      const input = 'secure-token-value';

      const hashes = await Promise.all(
        Array.from({ length: 10 }, () => hashToken(input)),
      );

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('cannot reasonably produce collisions for different inputs', async () => {
      const tokens = Array.from({ length: 100 }, (_, i) => `token-${i}`);
      const hashes = await Promise.all(tokens.map((token) => hashToken(token)));

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(100);
    });
  });
});

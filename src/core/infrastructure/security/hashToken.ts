/**
 * @module lib/security/hashToken
 * @description SHA-256 token hashing utility using the Web Crypto API.
 * Used for invitation token verification — the plaintext token is never
 * sent to the database; only the hash is compared.
 *
 * Reference: Web Crypto API — SubtleCrypto.digest()
 * https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 */

/**
 * Hashes a raw token string using SHA-256 via the Web Crypto API.
 * Returns the hex-encoded hash string.
 *
 * @param rawToken - The plaintext token to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashToken(rawToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

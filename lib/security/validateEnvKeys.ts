/**
 * @module lib/security/validateEnvKeys
 * @description Runtime validation to detect dangerous key misconfigurations.
 *
 * VULN-001 remediation: Prevents the service_role key from being used
 * in the client-side Supabase client. The service_role key bypasses
 * all RLS policies and must NEVER be exposed via VITE_ prefixed vars.
 *
 * Reference: Supabase docs — "Row Level Security" and "API Keys"
 * https://supabase.com/docs/guides/auth/row-level-security
 */

import { logger } from '../logger';

const log = logger.child('security');

/**
 * Known prefixes of Supabase JWT payloads.
 * - anon key:        role = "anon"
 * - service_role key: role = "service_role"
 *
 * We decode the JWT (base64url) and inspect the `role` claim.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface KeyValidationResult {
  isValid: boolean;
  role: string | null;
  warnings: string[];
  errors: string[];
}

/**
 * Validates the Supabase key being used in the client.
 * Returns structured result with errors/warnings.
 */
export function validateSupabaseKey(key: string): KeyValidationResult {
  const result: KeyValidationResult = {
    isValid: true,
    role: null,
    warnings: [],
    errors: [],
  };

  if (!key || key.length < 20) {
    result.isValid = false;
    result.errors.push('VITE_SUPABASE_ANON_KEY is missing or too short');
    return result;
  }

  const payload = decodeJwtPayload(key);

  if (!payload) {
    result.warnings.push('Could not decode Supabase key — unable to verify role');
    return result;
  }

  const role = typeof payload.role === 'string' ? payload.role : null;
  result.role = role;

  if (role === 'service_role') {
    result.isValid = false;
    result.errors.push(
      'CRITICAL SECURITY VULNERABILITY: VITE_SUPABASE_ANON_KEY contains a service_role key. ' +
      'This key bypasses ALL Row Level Security policies and is exposed in client-side JavaScript. ' +
      'Rotate this key IMMEDIATELY in the Supabase dashboard and replace with the anon key.',
    );
  } else if (role !== 'anon') {
    result.warnings.push(
      `Unexpected role "${role}" in Supabase key. Expected "anon" for client-side usage.`,
    );
  }

  // Check for suspicious expiration (service_role keys often have very long exp)
  if (typeof payload.exp === 'number') {
    const expDate = new Date(payload.exp * 1000);
    const yearsFromNow = (expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
    if (yearsFromNow > 50) {
      result.warnings.push(
        'Key has an unusually long expiration (50+ years). Verify this is the anon key.',
      );
    }
  }

  return result;
}

/**
 * Validates TURN credentials are not using static values in production.
 */
export function validateTurnCredentials(): string[] {
  const warnings: string[] = [];
  const env = import.meta.env;

  if (env.PROD && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL) {
    warnings.push(
      'Static TURN credentials are exposed to the client via VITE_ prefix. ' +
      'Consider implementing a TURN REST API endpoint that generates temporary credentials.',
    );
  }

  return warnings;
}

/**
 * Run all security validations at app startup.
 * In development: logs warnings.
 * In production with service_role key: throws to prevent startup.
 */
export function runStartupSecurityChecks(supabaseKey: string): void {
  const keyResult = validateSupabaseKey(supabaseKey);

  for (const warning of keyResult.warnings) {
    log.warn(warning);
  }

  for (const error of keyResult.errors) {
    log.error(error);
  }

  if (!keyResult.isValid && keyResult.role === 'service_role') {
    // In production, block the app from starting with service_role key
    if (import.meta.env.PROD) {
      throw new Error(
        '[SECURITY] Application cannot start: service_role key detected in client bundle. ' +
        'Replace VITE_SUPABASE_ANON_KEY with the anon key from Supabase dashboard.',
      );
    }
    // In development, show a very visible warning
    console.error(
      '%c⚠️ CRITICAL SECURITY ISSUE ⚠️',
      'background: red; color: white; font-size: 24px; font-weight: bold; padding: 10px;',
    );
    console.error(
      '%cYour VITE_SUPABASE_ANON_KEY contains the service_role key.\n' +
      'This bypasses ALL Row Level Security.\n' +
      'Replace it with the anon key from Supabase Dashboard > Settings > API.',
      'color: red; font-size: 14px;',
    );
  }

  const turnWarnings = validateTurnCredentials();
  for (const warning of turnWarnings) {
    log.warn(warning);
  }
}

/**
 * @module tests/stress/fase1-local/infrastructure/BaselineStorage
 *
 * File-based storage de baselines committed al repo.
 * Layout: tests/stress/fase1-local/baselines/<profileName>.json
 *
 * Clean Architecture: Infrastructure — filesystem. Domain lo consume via IBaselineStorage.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';

import type { BaselineSnapshot } from '../domain/BaselineComparison';
import type { LeakVerdict } from '../domain/LeakDetectionCriteria';

export interface IBaselineStorage {
  load(profileName: string): BaselineSnapshot | null;
  save(profileName: string, verdict: LeakVerdict): BaselineSnapshot;
  path(profileName: string): string;
}

export class FileBaselineStorage implements IBaselineStorage {
  constructor(private readonly rootDir: string) {}

  path(profileName: string): string {
    return join(this.rootDir, `${profileName}.json`);
  }

  load(profileName: string): BaselineSnapshot | null {
    const p = this.path(profileName);
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, 'utf8');
    return JSON.parse(raw) as BaselineSnapshot;
  }

  save(profileName: string, verdict: LeakVerdict): BaselineSnapshot {
    mkdirSync(this.rootDir, { recursive: true });
    const snapshot: BaselineSnapshot = {
      profile: profileName,
      capturedAt: new Date().toISOString(),
      gitCommit: safeGitCommit(),
      verdict,
    };
    writeFileSync(this.path(profileName), JSON.stringify(snapshot, null, 2));
    return snapshot;
  }
}

function safeGitCommit(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** Resuelve el dir absoluto de baselines relativo a este archivo. */
export function defaultBaselinesDir(scriptFileUrl: string): string {
  const dir = dirname(new URL(scriptFileUrl).pathname.replace(/^\/([A-Z]:)/, '$1'));
  return join(dir, '..', 'baselines');
}

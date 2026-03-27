import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '@/lib/logger';

describe('StructuredLogger', () => {
  beforeEach(() => {
    logger.flush();
    logger.setMinLevel('debug');
  });

  it('captures logs in ring buffer', () => {
    logger.info('test message', { key: 'val' });
    const logs = logger.getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('info');
    expect(logs[0].msg).toBe('test message');
    expect(logs[0].key).toBe('val');
    expect(logs[0].ts).toBeTruthy();
  });

  it('respects minLevel filtering', () => {
    logger.setMinLevel('warn');
    logger.debug('should be skipped');
    logger.info('should be skipped too');
    logger.warn('should appear');
    logger.error('should also appear');
    const logs = logger.getRecentLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].level).toBe('warn');
    expect(logs[1].level).toBe('error');
  });

  it('child logger adds module field', () => {
    const child = logger.child('ecs');
    child.info('system tick', { avatars: 42 });
    const logs = logger.getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].module).toBe('ecs');
    expect(logs[0].avatars).toBe(42);
  });

  it('ring buffer caps at 200 entries', () => {
    logger.setMinLevel('debug');
    for (let i = 0; i < 250; i++) {
      logger.debug(`msg-${i}`);
    }
    const logs = logger.getRecentLogs();
    expect(logs).toHaveLength(200);
    expect(logs[0].msg).toBe('msg-50');
    expect(logs[199].msg).toBe('msg-249');
  });

  it('setContext adds persistent fields', () => {
    logger.setContext({ userId: 'u-1', workspace: 'ws-1' });
    logger.info('connected');
    const log = logger.getRecentLogs()[0];
    expect(log.userId).toBe('u-1');
    expect(log.workspace).toBe('ws-1');
  });

  it('flush empties the buffer', () => {
    logger.info('before');
    expect(logger.getRecentLogs()).toHaveLength(1);
    logger.flush();
    expect(logger.getRecentLogs()).toHaveLength(0);
  });
});

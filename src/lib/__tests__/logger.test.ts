/**
 * Logger Test Suite
 * Tests Pino structured logging utility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { log, logger } from '../logger';

describe('logger.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('log.fatal', () => {
    it('should log fatal with string', () => {
      const spy = vi.spyOn(logger, 'fatal');
      log.fatal('Fatal error');
      expect(spy).toHaveBeenCalledWith('Fatal error');
    });

    it('should log fatal with object and message', () => {
      const spy = vi.spyOn(logger, 'fatal');
      log.fatal({ error: 'critical' }, 'Fatal error occurred');
      expect(spy).toHaveBeenCalledWith({ error: 'critical' }, 'Fatal error occurred');
    });
  });

  describe('log.error', () => {
    it('should log error with string', () => {
      const spy = vi.spyOn(logger, 'error');
      log.error('Error message');
      expect(spy).toHaveBeenCalledWith('Error message');
    });

    it('should log error with object and message', () => {
      const spy = vi.spyOn(logger, 'error');
      log.error({ code: 500 }, 'Internal error');
      expect(spy).toHaveBeenCalledWith({ code: 500 }, 'Internal error');
    });
  });

  describe('log.warn', () => {
    it('should log warn with string', () => {
      const spy = vi.spyOn(logger, 'warn');
      log.warn('Warning message');
      expect(spy).toHaveBeenCalledWith('Warning message');
    });

    it('should log warn with object and message', () => {
      const spy = vi.spyOn(logger, 'warn');
      log.warn({ status: 'deprecated' }, 'Feature deprecated');
      expect(spy).toHaveBeenCalledWith({ status: 'deprecated' }, 'Feature deprecated');
    });
  });

  describe('log.info', () => {
    it('should log info with string', () => {
      const spy = vi.spyOn(logger, 'info');
      log.info('Info message');
      expect(spy).toHaveBeenCalledWith('Info message');
    });

    it('should log info with object and message', () => {
      const spy = vi.spyOn(logger, 'info');
      log.info({ count: 10 }, 'Records processed');
      expect(spy).toHaveBeenCalledWith({ count: 10 }, 'Records processed');
    });
  });

  describe('log.debug', () => {
    it('should log debug with string', () => {
      const spy = vi.spyOn(logger, 'debug');
      log.debug('Debug message');
      expect(spy).toHaveBeenCalledWith('Debug message');
    });

    it('should log debug with object and message', () => {
      const spy = vi.spyOn(logger, 'debug');
      log.debug({ variable: 'value' }, 'Debug info');
      expect(spy).toHaveBeenCalledWith({ variable: 'value' }, 'Debug info');
    });
  });

  describe('log.trace', () => {
    it('should log trace with string', () => {
      const spy = vi.spyOn(logger, 'trace');
      log.trace('Trace message');
      expect(spy).toHaveBeenCalledWith('Trace message');
    });

    it('should log trace with object and message', () => {
      const spy = vi.spyOn(logger, 'trace');
      log.trace({ step: 1 }, 'Trace step');
      expect(spy).toHaveBeenCalledWith({ step: 1 }, 'Trace step');
    });
  });
});

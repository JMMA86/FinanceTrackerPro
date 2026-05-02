import { describe, it, expect, vi, afterEach } from 'vitest';
import { log, logger } from '../logger';

describe('logger.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when logging fatal messages', () => {
    it('should call logger with string message', () => {
      // Given
      const spy = vi.spyOn(logger, 'fatal');

      // When
      log.fatal('Fatal error');

      // Then
      expect(spy).toHaveBeenCalledWith('Fatal error');
    });

    it('should call logger with object and message', () => {
      // Given
      const spy = vi.spyOn(logger, 'fatal');

      // When
      log.fatal({ error: 'critical' }, 'Fatal error occurred');

      // Then
      expect(spy).toHaveBeenCalledWith({ error: 'critical' }, 'Fatal error occurred');
    });
  });

  describe('when logging error messages', () => {
    it('should call logger with string message', () => {
      // Given
      const spy = vi.spyOn(logger, 'error');

      // When
      log.error('Error message');

      // Then
      expect(spy).toHaveBeenCalledWith('Error message');
    });

    it('should call logger with object and message', () => {
      // Given
      const spy = vi.spyOn(logger, 'error');

      // When
      log.error({ code: 500 }, 'Internal error');

      // Then
      expect(spy).toHaveBeenCalledWith({ code: 500 }, 'Internal error');
    });
  });

  describe('when logging warn messages', () => {
    it('should call logger with string message', () => {
      // Given
      const spy = vi.spyOn(logger, 'warn');

      // When
      log.warn('Warning message');

      // Then
      expect(spy).toHaveBeenCalledWith('Warning message');
    });

    it('should call logger with object and message', () => {
      // Given
      const spy = vi.spyOn(logger, 'warn');

      // When
      log.warn({ status: 'deprecated' }, 'Feature deprecated');

      // Then
      expect(spy).toHaveBeenCalledWith({ status: 'deprecated' }, 'Feature deprecated');
    });
  });

  describe('when logging info messages', () => {
    it('should call logger with string message', () => {
      // Given
      const spy = vi.spyOn(logger, 'info');

      // When
      log.info('Info message');

      // Then
      expect(spy).toHaveBeenCalledWith('Info message');
    });

    it('should call logger with object and message', () => {
      // Given
      const spy = vi.spyOn(logger, 'info');

      // When
      log.info({ count: 10 }, 'Records processed');

      // Then
      expect(spy).toHaveBeenCalledWith({ count: 10 }, 'Records processed');
    });
  });

  describe('when logging debug messages', () => {
    it('should call logger with string message', () => {
      // Given
      const spy = vi.spyOn(logger, 'debug');

      // When
      log.debug('Debug message');

      // Then
      expect(spy).toHaveBeenCalledWith('Debug message');
    });

    it('should call logger with object and message', () => {
      // Given
      const spy = vi.spyOn(logger, 'debug');

      // When
      log.debug({ variable: 'value' }, 'Debug info');

      // Then
      expect(spy).toHaveBeenCalledWith({ variable: 'value' }, 'Debug info');
    });
  });

  describe('when logging trace messages', () => {
    it('should call logger with string message', () => {
      // Given
      const spy = vi.spyOn(logger, 'trace');

      // When
      log.trace('Trace message');

      // Then
      expect(spy).toHaveBeenCalledWith('Trace message');
    });

    it('should call logger with object and message', () => {
      // Given
      const spy = vi.spyOn(logger, 'trace');

      // When
      log.trace({ step: 1 }, 'Trace step');

      // Then
      expect(spy).toHaveBeenCalledWith({ step: 1 }, 'Trace step');
    });
  });
});

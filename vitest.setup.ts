import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { webcrypto } from 'crypto';

// Polyfill Web Crypto API and TextEncoder for jose library
if (!global.crypto) {
  global.crypto = webcrypto as Crypto;
}

// Use global TextEncoder from Web API (available in Node 18+)
if (typeof global.TextEncoder === 'undefined') {
  // Create wrapper that returns proper Uint8Array
  class TextEncoderPolyfill {
    encode(input: string): Uint8Array {
      const buffer = Buffer.from(input, 'utf-8');
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
  }

  global.TextEncoder = TextEncoderPolyfill as unknown as typeof TextEncoder;
}

// Mock server-only module for tests
vi.mock('server-only', () => ({}));

// Mock dotenv/config for tests
vi.mock('dotenv/config', () => ({}));

// Ensure JWT_SECRET is set before any module that imports session.ts loads
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-testing-min-32-characters-long';

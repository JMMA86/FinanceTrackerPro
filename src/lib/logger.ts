/**
 * Structured Logger (Pino) with PII Masking
 *
 * Production: JSON for log aggregators
 * Development: Pretty-printed for readability
 *
 * PII Protection:
 * - Email: user@example.com → u***@e***.com
 * - Phone: +1234567890 → +*********0
 * - IP Address: Full IP logged (needed for security audit)
 * - Account IDs: Masked except last 4 chars
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

const PII_FIELDS = ['email', 'phone', 'name', 'fullName', 'accountNumber', 'description'];

function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return email;
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const maskedLocal = local.length > 2 ? local[0] + '***' : local[0] + '**';
  const domainParts = domain.split('.');
  const maskedDomain =
    domainParts.length > 1 ? domainParts[0][0] + '***.' + domainParts.slice(1).join('.') : domain;
  return `${maskedLocal}@${maskedDomain}`;
}

function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return phone;
  if (phone.length <= 4) return phone;
  return phone.slice(0, -4).replaceAll(/./g, '*') + phone.slice(-4);
}

function maskString(str: string, preserveEnd: number = 4): string {
  if (!str || typeof str !== 'string' || str.length <= preserveEnd) return str;
  return str.slice(0, -preserveEnd).replaceAll(/./g, '*') + str.slice(-preserveEnd);
}

function isPIIField(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return PII_FIELDS.some((field) => lowerKey === field.toLowerCase());
}

function getMaskType(key: string): string {
  const lowerKey = key.toLowerCase();
  if (lowerKey.includes('email')) return 'email';
  if (lowerKey.includes('phone')) return 'phone';
  if (lowerKey.includes('accountnumber') || lowerKey.includes('number')) return 'account';
  return 'default';
}

function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const maskType = getMaskType(key);
  switch (maskType) {
    case 'email':
      return maskEmail(value);
    case 'phone':
      return maskPhone(value);
    case 'account':
      return maskString(value, 4);
    default:
      return maskString(value, 4);
  }
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isPIIField(key)) {
      sanitized[key] = maskValue(key, value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    ...pino.stdSerializers,
  },
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
});

/**
 * Log levels:
 * - fatal: Application crash
 * - error: Errors that need attention
 * - warn: Warnings (recoverable issues)
 * - info: Important events
 * - debug: Detailed debugging
 * - trace: Very detailed debugging
 */

const sanitizeForLogging = (obj: object): object => {
  if (typeof obj !== 'object' || obj === null) return obj;
  return sanitizeObject(obj as Record<string, unknown>);
};

const logWithSanitization = (
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
  obj: object | string,
  msg?: string
) => {
  if (typeof obj === 'string') {
    logger[level](obj);
  } else {
    logger[level](sanitizeForLogging(obj), msg);
  }
};

export const log = {
  fatal: (obj: object | string, msg?: string) => logWithSanitization('fatal', obj, msg),
  error: (obj: object | string, msg?: string) => logWithSanitization('error', obj, msg),
  warn: (obj: object | string, msg?: string) => logWithSanitization('warn', obj, msg),
  info: (obj: object | string, msg?: string) => logWithSanitization('info', obj, msg),
  debug: (obj: object | string, msg?: string) => logWithSanitization('debug', obj, msg),
  trace: (obj: object | string, msg?: string) => logWithSanitization('trace', obj, msg),
};

export { sanitizeObject, maskEmail, maskPhone, maskString };
export { PII_FIELDS };

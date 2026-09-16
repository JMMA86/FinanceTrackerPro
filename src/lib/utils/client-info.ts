/**
 * Extract client IP and user agent robustly (Fix A4)
 * x-forwarded-for can be a comma-separated list: client, proxy1, proxy2
 */

import { headers } from 'next/headers';

export async function getClientInfo(): Promise<{ ipAddress: string; userAgent: string }> {
  const headersList = await headers();
  const rawIp = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '';
  const ipAddress = rawIp.split(',')[0].trim() || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';
  return { ipAddress, userAgent };
}

/**
 * Dynamic Sitemap for FinanceTrackerPro
 * Generates XML sitemap from available routes
 */

import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://financetrackerpro.com';

const staticRoutes = [
  '',
  '/es/login',
  '/es/register',
  '/en/login',
  '/en/register',
  '/es/dashboard',
  '/en/dashboard',
  '/es/accounts',
  '/en/accounts',
  '/es/transactions',
  '/en/transactions',
  '/es/savings',
  '/en/savings',
  '/es/investments',
  '/en/investments',
  '/es/loans',
  '/en/loans',
  '/es/fixed-expenses',
  '/en/fixed-expenses',
  '/es/variable-expenses',
  '/en/variable-expenses',
  '/es/settings',
  '/en/settings',
  '/es/credit-cards',
  '/en/credit-cards',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const getPriority = (route: string): number => {
    if (route === '') return 1;
    if (route.includes('/dashboard')) return 0.9;
    return 0.7;
  };

  const getChangeFrequency = (route: string): 'weekly' | 'monthly' => {
    return route === '' ? 'weekly' : 'monthly';
  };

  const routes = staticRoutes.map((route) => {
    const url = route === '' ? BASE_URL : `${BASE_URL}${route}`;

    return {
      url,
      lastModified: now,
      changeFrequency: getChangeFrequency(route),
      priority: getPriority(route),
    };
  });

  return routes;
}

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
  '/de/login',
  '/de/register',
  '/es/dashboard',
  '/en/dashboard',
  '/de/dashboard',
  '/es/accounts',
  '/en/accounts',
  '/de/accounts',
  '/es/transactions',
  '/en/transactions',
  '/de/transactions',
  '/es/savings',
  '/en/savings',
  '/de/savings',
  '/es/investments',
  '/en/investments',
  '/de/investments',
  '/es/loans',
  '/en/loans',
  '/de/loans',
  '/es/fixed-expenses',
  '/en/fixed-expenses',
  '/de/fixed-expenses',
  '/es/variable-expenses',
  '/en/variable-expenses',
  '/de/variable-expenses',
  '/es/settings',
  '/en/settings',
  '/de/settings',
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
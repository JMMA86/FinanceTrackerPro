/**
 * Navigation Configuration Test Suite
 * Tests navigation items and mobile filtering
 */

import { describe, it, expect } from 'vitest';
import { navigationItems, mobileNavigationItems } from '../navigation';

describe('navigation.ts', () => {
  describe('navigationItems', () => {
    it('should have all required navigation items', () => {
      expect(navigationItems).toHaveLength(9);
    });

    it('should have Dashboard item', () => {
      const dashboard = navigationItems.find((item) => item.nameKey === 'dashboard');
      expect(dashboard).toBeDefined();
      expect(dashboard?.href).toBe('/dashboard');
      expect(dashboard?.showInMobile).toBe(true);
    });

    it('should have Transactions item', () => {
      const transactions = navigationItems.find((item) => item.nameKey === 'transactions');
      expect(transactions).toBeDefined();
      expect(transactions?.href).toBe('/transactions');
      expect(transactions?.showInMobile).toBe(true);
    });

    it('should have Accounts item', () => {
      const accounts = navigationItems.find((item) => item.nameKey === 'accounts');
      expect(accounts).toBeDefined();
      expect(accounts?.href).toBe('/accounts');
      expect(accounts?.showInMobile).toBe(true);
    });

    it('should have items with icons', () => {
      navigationItems.forEach((item) => {
        expect(item.icon).toBeDefined();
        // Icons are React components (objects/functions)
        expect(item.icon).toBeTruthy();
      });
    });

    it('should have items with translation keys', () => {
      navigationItems.forEach((item) => {
        expect(item.nameKey).toBeDefined();
        expect(typeof item.nameKey).toBe('string');
        expect(item.nameKey.length).toBeGreaterThan(0);

        expect(item.descKey).toBeDefined();
        expect(typeof item.descKey).toBe('string');
        expect(item.descKey.length).toBeGreaterThan(0);
      });
    });
  });

  describe('mobileNavigationItems', () => {
    it('should only include items with showInMobile=true', () => {
      mobileNavigationItems.forEach((item) => {
        expect(item.showInMobile).toBe(true);
      });
    });

    it('should have 5 mobile items', () => {
      expect(mobileNavigationItems).toHaveLength(5);
    });

    it('should include Dashboard in mobile', () => {
      const hasDashboard = mobileNavigationItems.some((item) => item.nameKey === 'dashboard');
      expect(hasDashboard).toBe(true);
    });

    it('should include Settings in mobile', () => {
      const hasSettings = mobileNavigationItems.some((item) => item.nameKey === 'settings');
      expect(hasSettings).toBe(true);
    });

    it('should not include Investments in mobile', () => {
      const hasInvestments = mobileNavigationItems.some((item) => item.nameKey === 'investments');
      expect(hasInvestments).toBe(false);
    });
  });
});

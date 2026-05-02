import { describe, it, expect } from 'vitest';
import { navigationItems, mobileNavigationItems } from '../navigation';

describe('navigation.ts', () => {
  describe('when checking all navigation items', () => {
    it('should have 9 total items', () => {
      // Given / When / Then
      expect(navigationItems).toHaveLength(9);
    });

    it('should include Dashboard with correct href and mobile visibility', () => {
      // Given / When
      const dashboard = navigationItems.find((item) => item.nameKey === 'dashboard');

      // Then
      expect(dashboard).toBeDefined();
      expect(dashboard?.href).toBe('/dashboard');
      expect(dashboard?.showInMobile).toBe(true);
    });

    it('should include Transactions with correct href and mobile visibility', () => {
      // Given / When
      const transactions = navigationItems.find((item) => item.nameKey === 'transactions');

      // Then
      expect(transactions).toBeDefined();
      expect(transactions?.href).toBe('/transactions');
      expect(transactions?.showInMobile).toBe(true);
    });

    it('should include Accounts with correct href and mobile visibility', () => {
      // Given / When
      const accounts = navigationItems.find((item) => item.nameKey === 'accounts');

      // Then
      expect(accounts).toBeDefined();
      expect(accounts?.href).toBe('/accounts');
      expect(accounts?.showInMobile).toBe(true);
    });

    it('should provide an icon for every item', () => {
      // Given / When / Then
      navigationItems.forEach((item) => {
        expect(item.icon).toBeTruthy();
      });
    });

    it('should provide translation keys for every item', () => {
      // Given / When / Then
      navigationItems.forEach((item) => {
        expect(typeof item.nameKey).toBe('string');
        expect(item.nameKey.length).toBeGreaterThan(0);
        expect(typeof item.descKey).toBe('string');
        expect(item.descKey.length).toBeGreaterThan(0);
      });
    });
  });

  describe('when checking mobile navigation items', () => {
    it('should only include items flagged for mobile', () => {
      // Given / When / Then
      mobileNavigationItems.forEach((item) => {
        expect(item.showInMobile).toBe(true);
      });
    });

    it('should have exactly 5 items', () => {
      // Given / When / Then
      expect(mobileNavigationItems).toHaveLength(5);
    });

    it('should include Dashboard', () => {
      // Given / When
      const hasDashboard = mobileNavigationItems.some((item) => item.nameKey === 'dashboard');

      // Then
      expect(hasDashboard).toBe(true);
    });

    it('should include Settings', () => {
      // Given / When
      const hasSettings = mobileNavigationItems.some((item) => item.nameKey === 'settings');

      // Then
      expect(hasSettings).toBe(true);
    });

    it('should exclude Investments', () => {
      // Given / When
      const hasInvestments = mobileNavigationItems.some((item) => item.nameKey === 'investments');

      // Then
      expect(hasInvestments).toBe(false);
    });
  });
});

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
      const dashboard = navigationItems.find((item) => item.name === 'Dashboard');
      expect(dashboard).toBeDefined();
      expect(dashboard?.href).toBe('/dashboard');
      expect(dashboard?.showInMobile).toBe(true);
    });

    it('should have Transacciones item', () => {
      const transactions = navigationItems.find((item) => item.name === 'Transacciones');
      expect(transactions).toBeDefined();
      expect(transactions?.href).toBe('/transactions');
      expect(transactions?.showInMobile).toBe(true);
    });

    it('should have Cuentas item', () => {
      const accounts = navigationItems.find((item) => item.name === 'Cuentas');
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

    it('should have items with descriptions', () => {
      navigationItems.forEach((item) => {
        expect(item.description).toBeDefined();
        expect(typeof item.description).toBe('string');
        expect(item.description.length).toBeGreaterThan(0);
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
      const hasDashboard = mobileNavigationItems.some((item) => item.name === 'Dashboard');
      expect(hasDashboard).toBe(true);
    });

    it('should include Settings in mobile', () => {
      const hasSettings = mobileNavigationItems.some((item) => item.name === 'Configuración');
      expect(hasSettings).toBe(true);
    });

    it('should not include Inversiones in mobile', () => {
      const hasInvestments = mobileNavigationItems.some((item) => item.name === 'Inversiones');
      expect(hasInvestments).toBe(false);
    });
  });
});

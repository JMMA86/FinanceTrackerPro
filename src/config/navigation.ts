import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  LineChart,
  Home,
  ShoppingBasket,
  HandCoins,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  description: string;
  showInMobile?: boolean; // Show in bottom bar
}

export const navigationItems: NavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Vista general de finanzas',
    showInMobile: true,
  },
  {
    name: 'Transacciones',
    href: '/transactions',
    icon: ArrowLeftRight,
    description: 'Historial de movimientos',
    showInMobile: true,
  },
  {
    name: 'Cuentas',
    href: '/accounts',
    icon: Wallet,
    description: 'Gestión de cuentas',
    showInMobile: true,
  },
  {
    name: 'Ahorros',
    href: '/savings',
    icon: PiggyBank,
    description: 'Metas de ahorro',
    showInMobile: true,
  },
  {
    name: 'Inversiones',
    href: '/investments',
    icon: LineChart,
    description: 'Portfolio de inversiones',
    showInMobile: false,
  },
  {
    name: 'Gastos Fijos',
    href: '/fixed-expenses',
    icon: Home,
    description: 'Gastos recurrentes',
    showInMobile: false,
  },
  {
    name: 'Gastos Variables',
    href: '/variable-expenses',
    icon: ShoppingBasket,
    description: 'Gastos por categoría',
    showInMobile: false,
  },
  {
    name: 'Préstamos',
    href: '/loans',
    icon: HandCoins,
    description: 'Gestión de préstamos',
    showInMobile: false,
  },
  {
    name: 'Configuración',
    href: '/settings',
    icon: Settings,
    description: 'Preferencias del sistema',
    showInMobile: true,
  },
];

// Mobile navigation items (bottom bar)
export const mobileNavigationItems = navigationItems.filter((item) => item.showInMobile);

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
  CreditCard,
  type LucideIcon,
} from 'lucide-react';

export interface NavigationItem {
  nameKey: string; // i18n key for name
  descKey: string; // i18n key for description
  href: string;
  icon: LucideIcon;
  showInMobile?: boolean; // Show in bottom bar
}

export const navigationItems: NavigationItem[] = [
  {
    nameKey: 'dashboard',
    descKey: 'dashboardDesc',
    href: '/dashboard',
    icon: LayoutDashboard,
    showInMobile: true,
  },
  {
    nameKey: 'transactions',
    descKey: 'transactionsDesc',
    href: '/transactions',
    icon: ArrowLeftRight,
    showInMobile: true,
  },
  {
    nameKey: 'accounts',
    descKey: 'accountsDesc',
    href: '/accounts',
    icon: Wallet,
    showInMobile: true,
  },
  {
    nameKey: 'savings',
    descKey: 'savingsDesc',
    href: '/savings',
    icon: PiggyBank,
    showInMobile: true,
  },
  {
    nameKey: 'investments',
    descKey: 'investmentsDesc',
    href: '/investments',
    icon: LineChart,
    showInMobile: false,
  },
  {
    nameKey: 'fixedExpenses',
    descKey: 'fixedExpensesDesc',
    href: '/fixed-expenses',
    icon: Home,
    showInMobile: false,
  },
  {
    nameKey: 'variableExpenses',
    descKey: 'variableExpensesDesc',
    href: '/variable-expenses',
    icon: ShoppingBasket,
    showInMobile: false,
  },
  {
    nameKey: 'loans',
    descKey: 'loansDesc',
    href: '/loans',
    icon: HandCoins,
    showInMobile: false,
  },
  {
    nameKey: 'creditCards',
    descKey: 'creditCardsDesc',
    href: '/credit-cards',
    icon: CreditCard,
    showInMobile: false,
  },
  {
    nameKey: 'settings',
    descKey: 'settingsDesc',
    href: '/settings',
    icon: Settings,
    showInMobile: true,
  },
];

// Mobile navigation items (bottom bar)
export const mobileNavigationItems = navigationItems.filter((item) => item.showInMobile);

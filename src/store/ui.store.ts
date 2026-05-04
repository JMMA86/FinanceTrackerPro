/**
 * UI State Store (Zustand)
 *
 * This store manages UI state only:
 * - Sidebar visibility
 * - Modal visibility
 * - Theme preference
 * - Loading states
 *
 * NO business logic, NO calculations, NO financial data
 */

import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

type ModalId = 
  | 'create-account'
  | 'create-transaction'
  | 'create-transfer'
  | 'edit-account'
  | 'delete-confirm'
  | 'settings'
  | null;

interface UIState {
  isSidebarOpen: boolean;
  isMobileMenuOpen: boolean;
  activeModal: ModalId;
  modalData: Record<string, unknown> | null;
  theme: Theme;
  isLoading: boolean;
  loadingMessage: string | null;
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: number;
  }>;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  openModal: (modalId: Exclude<ModalId, null>, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  setTheme: (theme: Theme) => void;
  setLoading: (isLoading: boolean, message?: string) => void;
  addNotification: (type: UIState['notifications'][0]['type'], message: string) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

const generateNotificationId = (): string => {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  const randomPart = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `notif-${Date.now()}-${randomPart}`;
};

export const useUIStore = create<UIState & UIActions>((set, get) => ({
  isSidebarOpen: true,
  isMobileMenuOpen: false,
  activeModal: null,
  modalData: null,
  theme: 'system',
  isLoading: false,
  loadingMessage: null,
  notifications: [],

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  setSidebarOpen: (open: boolean) => set({ isSidebarOpen: open }),

  toggleMobileMenu: () => set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),

  setMobileMenuOpen: (open: boolean) => set({ isMobileMenuOpen: open }),

  openModal: (modalId: Exclude<ModalId, null>, data?: Record<string, unknown>) =>
    set({ activeModal: modalId, modalData: data || null }),

  closeModal: () => set({ activeModal: null, modalData: null }),

  setTheme: (theme: Theme) => set({ theme }),

  setLoading: (isLoading: boolean, message?: string) =>
    set({ isLoading, loadingMessage: message || null }),

  addNotification: (type, message) => {
    const id = generateNotificationId();
    const timestamp = Date.now();
    set((state) => ({
      notifications: [...state.notifications, { id, type, message, timestamp }],
    }));

    setTimeout(() => {
      get().removeNotification(id);
    }, 5000);
  },

  removeNotification: (id: string) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),
}));

export type { UIState, UIActions, Theme, ModalId };
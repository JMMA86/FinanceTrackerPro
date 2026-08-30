/**
 * Shared types for transaction components.
 *
 * CategoryBrief mirrors the fields consumed by the UI from `getCategories`.
 * `userId === null` identifies a system (shared) category.
 */

export interface CategoryBrief {
  id: string;
  name: string;
  type: string;
  color: string | null;
  userId: string | null;
}

export interface AccountBrief {
  id: string;
  name: string;
  currency: string;
}

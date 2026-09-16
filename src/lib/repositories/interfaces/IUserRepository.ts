import type { User, Currency, Language, Theme } from '@prisma/client';

export interface IUserRepository {
  /**
   * Find user by ID
   */
  findById(id: string): Promise<User | null>;

  /**
   * Find user by email
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Create new user
   */
  create(data: {
    email: string;
    name: string;
    passwordHash?: string;
    baseSalaryCents?: number;
    baseCurrency?: Currency;
    language?: Language;
    theme?: Theme;
  }): Promise<User>;

  /**
   * Update last login timestamp
   */
  updateLastLogin(id: string): Promise<User>;

  /**
   * Soft delete user
   */
  softDelete(id: string): Promise<User>;
}

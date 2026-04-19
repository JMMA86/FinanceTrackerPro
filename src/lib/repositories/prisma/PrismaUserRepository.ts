/**
 * Prisma User Repository Implementation
 * Handles user data persistence
 */

import 'server-only';
import { prisma } from '@/lib/db';
import type { IUserRepository } from '../interfaces/IUserRepository';
import type { User, Currency, Language, Theme } from '@prisma/client';

export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id, isActive: true },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase(), isActive: true },
    });
  }

  async create(data: {
    email: string;
    name: string;
    passwordHash?: string;
    baseSalaryCents?: number;
    baseCurrency?: Currency;
    language?: Language;
    theme?: Theme;
  }): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: data.passwordHash,
        baseSalaryCents: data.baseSalaryCents,
        baseCurrency: data.baseCurrency,
        language: data.language,
        theme: data.theme,
      },
    });
  }

  async updateLastLogin(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async softDelete(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
  }
}

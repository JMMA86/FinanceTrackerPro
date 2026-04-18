import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock server-only module for tests
vi.mock('server-only', () => ({}));

// Mock dotenv/config for tests
vi.mock('dotenv/config', () => ({}));

// Set DATABASE_URL for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

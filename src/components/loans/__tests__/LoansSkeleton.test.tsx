/**
 * LoansSkeleton Component Test — decorative loading placeholder.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LoansSkeleton } from '../LoansSkeleton';

describe('LoansSkeleton', () => {
  it('renderiza un placeholder decorativo aria-hidden', () => {
    const { container } = render(<LoansSkeleton />);

    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

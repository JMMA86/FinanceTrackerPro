/**
 * VariableExpensesSkeleton Component Tests — decorative loading placeholder.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VariableExpensesSkeleton } from '../VariableExpensesSkeleton';

describe('VariableExpensesSkeleton', () => {
  it('renders a decorative (aria-hidden) pulsing placeholder', () => {
    const { container } = render(<VariableExpensesSkeleton />);

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

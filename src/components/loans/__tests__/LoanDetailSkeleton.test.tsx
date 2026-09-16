/**
 * LoanDetailSkeleton Component Test — decorative loading placeholder.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LoanDetailSkeleton } from '../LoanDetailSkeleton';

describe('LoanDetailSkeleton', () => {
  it('renderiza un placeholder decorativo aria-hidden con 8 tarjetas', () => {
    const { container } = render(<LoanDetailSkeleton />);

    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.app-shell')).toHaveLength(10);
  });
});

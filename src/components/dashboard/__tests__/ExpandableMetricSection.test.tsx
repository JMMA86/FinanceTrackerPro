/**
 * ExpandableMetricSection Component Tests
 *
 * Collapsible section: header button toggles aria-expanded and a CSS max-height
 * class on the content wrapper.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExpandableMetricSection } from '../ExpandableMetricSection';

describe('ExpandableMetricSection', () => {
  const renderSection = (
    props: {
      title?: string;
      defaultOpen?: boolean;
      category?: string;
    } = {}
  ) =>
    render(
      <ExpandableMetricSection
        title={props.title ?? 'Liquidez'}
        icon={<span data-testid="metric-icon">icon</span>}
        defaultOpen={props.defaultOpen}
        category={props.category ?? 'liquidity'}
      >
        <p>Contenido expandible</p>
      </ExpandableMetricSection>
    );

  it('should render the title and icon', () => {
    renderSection();
    expect(screen.getByText('Liquidez')).toBeInTheDocument();
    expect(screen.getByTestId('metric-icon')).toBeInTheDocument();
  });

  it('should be collapsed by default', () => {
    const { container } = renderSection();
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    const content = container.querySelector('div.overflow-hidden');
    expect(content?.className).toContain('max-h-0');
    expect(content?.className).toContain('opacity-0');
  });

  it('should expand when the header is clicked', () => {
    const { container } = renderSection();
    const toggle = screen.getByRole('button');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const content = container.querySelector('div.overflow-hidden');
    expect(content?.className).toContain('max-h-[600px]');
    expect(content?.className).toContain('opacity-100');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('should start open when defaultOpen is true', () => {
    const { container } = renderSection({ defaultOpen: true });
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const content = container.querySelector('div.overflow-hidden');
    expect(content?.className).toContain('max-h-[600px]');
  });

  it('should apply the category accent class', () => {
    const { container } = renderSection({ category: 'debts' });
    // debts → text-rose-400
    expect(container.querySelector('.text-rose-400')).toBeInTheDocument();
  });

  it('should fall back to the default accent for unknown categories', () => {
    const { container } = renderSection({ category: 'unknown' });
    expect(container.querySelector('.text-blue-400')).toBeInTheDocument();
  });

  it('should render children content', () => {
    renderSection();
    expect(screen.getByText('Contenido expandible')).toBeInTheDocument();
  });
});

/**
 * AnimatedBackground Smoke Tests
 * Purely visual component — covers both variants (default and minimal) to
 * ensure they render without breaking and include the grid + symbols.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedBackground } from '../AnimatedBackground';

describe('AnimatedBackground', () => {
  const ROOT_CLASS = '.absolute.inset-0.overflow-hidden.select-none';

  it('renders the full variant by default with the grid and financial symbols', () => {
    const { container } = render(<AnimatedBackground />);

    expect(container.querySelector(ROOT_CLASS)).toBeInTheDocument();
    // The full variant includes a radial glow (blur-3xl) plus drifting symbols.
    expect(container.querySelectorAll('.blur-3xl').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€').length).toBeGreaterThan(0);
  });

  it('renders the minimal variant when minimal is true', () => {
    const { container } = render(<AnimatedBackground minimal />);

    expect(container.querySelector(ROOT_CLASS)).toBeInTheDocument();
    // Minimal variant has no radial glow.
    expect(container.querySelector('.blur-3xl')).not.toBeInTheDocument();
    expect(screen.getAllByText('$').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€').length).toBeGreaterThan(0);
    expect(screen.getAllByText('%').length).toBeGreaterThan(0);
  });

  it('renders the minimal variant when minimal is explicitly set to true via prop', () => {
    const { container } = render(<AnimatedBackground minimal={true} />);

    expect(container.querySelector(ROOT_CLASS)).toBeInTheDocument();
    expect(screen.getAllByText('₿').length).toBeGreaterThan(0);
  });
});

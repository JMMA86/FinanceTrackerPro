/**
 * SparklineChart Tests
 *
 * Tiny inline SVG trend line. Returns null for empty data and must not emit NaN
 * coordinates for a single data point.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SparklineChart } from '../SparklineChart';

describe('SparklineChart', () => {
  it('renders nothing when data is empty', () => {
    const { container } = render(<SparklineChart data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an accessible-hidden svg with a line and an area path', () => {
    const { container } = render(<SparklineChart data={[1, 2, 3, 4]} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
  });

  it('centers a single data point instead of producing NaN coordinates', () => {
    const { container } = render(<SparklineChart data={[42]} />);
    const paths = container.querySelectorAll('path');
    const line = paths[1];
    expect(line.getAttribute('d')).not.toContain('NaN');
    // A single point is horizontally centered at x=50.
    expect(line.getAttribute('d')).toContain('M 50');
  });

  it('honours the custom height and color', () => {
    const { container } = render(
      <SparklineChart data={[1, 2]} height={40} color="text-rose-400" />
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('height', '40');
    expect(svg?.getAttribute('class')).toContain('text-rose-400');
  });

  it('draws a flat line when all values are equal (range guard)', () => {
    const { container } = render(<SparklineChart data={[5, 5, 5]} />);
    const paths = container.querySelectorAll('path');
    expect(paths[1].getAttribute('d')).not.toContain('NaN');
  });
});

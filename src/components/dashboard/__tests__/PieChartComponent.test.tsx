/**
 * PieChartComponent Tests
 *
 * Pure SVG pie chart with hover tooltip + legend. No external mocks needed.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PieChartComponent } from '../PieChartComponent';

describe('PieChartComponent', () => {
  const data = [
    { category: 'Salud', amount: 50000, percentage: 50, color: '#f43f5e' },
    { category: 'Educación', amount: 30000, percentage: 30, color: '#8b5cf6' },
    { category: 'Vivienda', amount: 20000, percentage: 20, color: '#10b981' },
  ];

  it('should render an svg with the given size', () => {
    const { container } = render(<PieChartComponent data={data} size={240} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '240');
    expect(svg).toHaveAttribute('height', '240');
  });

  it('should render one segment path per data item', () => {
    const { container } = render(<PieChartComponent data={data} />);
    // One `<path>` per segment (glow paths only render on hover)
    const paths = container.querySelectorAll('svg path');
    expect(paths).toHaveLength(data.length);
  });

  it('should render a legend button for each category', () => {
    render(<PieChartComponent data={data} />);
    const legendButtons = screen.getAllByRole('button', { name: /Mostrar detalles de/ });
    expect(legendButtons).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Mostrar detalles de Salud' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mostrar detalles de Vivienda' })
    ).toBeInTheDocument();
  });

  it('should render the total in the center', () => {
    render(<PieChartComponent data={data} />);
    // formatCOP uses a NBSP (U+00A0) separator, which breaks exact getByText
    // matches — assert with a regex against the normalized text instead.
    expect(screen.getByText(/1\.000/)).toBeInTheDocument();
  });

  it('should show a tooltip when hovering a segment', () => {
    const { container } = render(<PieChartComponent data={data} />);
    const segment = container.querySelector('svg path')!;
    fireEvent.mouseEnter(segment);

    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();

    fireEvent.mouseLeave(segment);
    expect(screen.queryByText('50.0%')).not.toBeInTheDocument();
  });

  it('should show a tooltip when focusing a legend button', () => {
    render(<PieChartComponent data={data} />);
    const saludButton = screen.getByRole('button', { name: 'Mostrar detalles de Salud' });
    fireEvent.focus(saludButton);

    expect(screen.getByText('50.0%')).toBeInTheDocument();

    fireEvent.blur(saludButton);
    expect(screen.queryByText('50.0%')).not.toBeInTheDocument();
  });

  it('should render without crashing when data is empty', () => {
    const { container } = render(<PieChartComponent data={[]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Mostrar detalles de/ })).not.toBeInTheDocument();
    // Total is zero
    expect(screen.getByText(/0$/)).toBeInTheDocument();
  });

  it('should use the default size of 220', () => {
    const { container } = render(<PieChartComponent data={data} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '220');
    expect(svg).toHaveAttribute('height', '220');
  });
});

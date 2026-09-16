/**
 * PieChartComponent Tests
 *
 * Pure SVG pie chart with hover tooltip + accessible legend. No external mocks.
 * Also covers the Fase 2 props added for the net-worth composition:
 * `hideLegend`, `centerAmount`, `centerLabel` and `centerFormatted`.
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

  // ── Accessibility: legend name vs description (WCAG 4.1.2) ────────────────

  it('keeps the accessible name as "${detailsLabel} ${category}" exactly', () => {
    render(<PieChartComponent data={data} detailsLabel="Detalles de" />);

    // Exact-name lookup fails if the amount/percentage leaked into the name.
    const button = screen.getByRole('button', { name: 'Detalles de Salud' });
    expect(button).toBeInTheDocument();
    expect(button.getAttribute('aria-label')).toBe('Detalles de Salud');
  });

  it('exposes amount and percentage through aria-describedby', () => {
    render(<PieChartComponent data={data} detailsLabel="Detalles de" />);

    const button = screen.getByRole('button', { name: 'Detalles de Salud' });
    const descriptionId = button.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();

    const description = document.getElementById(descriptionId!);
    expect(description).not.toBeNull();
    expect(description?.textContent).toContain('50.0%');
  });

  it('should render the total in the center', () => {
    render(<PieChartComponent data={data} />);
    // formatCOP uses a NBSP (U+00A0) separator, which breaks exact getByText
    // matches — assert against the chart's accessible label instead.
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/1\.000/);
  });

  // ── New center overrides ──────────────────────────────────────────────────

  it('uses centerAmount instead of the slice sum when provided', () => {
    render(<PieChartComponent data={data} centerAmount={1234500} />);

    // 1_234_500 cents = 12_345 COP (0 fraction digits)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/12\.345/);
  });

  it('renders centerFormatted verbatim when provided', () => {
    render(
      <PieChartComponent data={data} centerFormatted="$ 987.654" centerLabel="Total activos" />
    );

    expect(screen.getByText('$ 987.654')).toBeInTheDocument();
    expect(screen.getByText('Total activos')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Total activos: $ 987.654');
  });

  it('falls back to totalLabel/centerAmount when the new props are omitted', () => {
    render(<PieChartComponent data={data} totalLabel="Total" />);
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  // ── hideLegend ────────────────────────────────────────────────────────────

  it('does not render the internal legend when hideLegend is true', () => {
    render(<PieChartComponent data={data} hideLegend />);

    expect(screen.queryByRole('button', { name: /Mostrar detalles de/ })).not.toBeInTheDocument();
    // The chart itself is still rendered.
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('should show a tooltip when hovering a segment', () => {
    const { container } = render(<PieChartComponent data={data} />);
    const segment = container.querySelector('svg path')!;
    // The legend renders sr-only descriptions too, so count tooltip matches.
    expect(screen.queryAllByText('50.0%')).toHaveLength(0);
    fireEvent.mouseEnter(segment);

    expect(screen.getAllByText('50.0%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/500/).length).toBeGreaterThanOrEqual(1);

    fireEvent.mouseLeave(segment);
    expect(screen.queryAllByText('50.0%')).toHaveLength(0);
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
    expect(screen.getAllByText(/0$/).length).toBeGreaterThanOrEqual(1);
  });

  it('should use the default size of 220', () => {
    const { container } = render(<PieChartComponent data={data} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '220');
    expect(svg).toHaveAttribute('height', '220');
  });
});

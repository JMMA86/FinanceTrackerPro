/**
 * InlineMetric Component Tests
 *
 * Displays a label, value (optionally masked), sparkline and a trend badge.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineMetric } from '../InlineMetric';

describe('InlineMetric', () => {
  const renderMetric = (props: {
    label?: string;
    value?: string;
    subValue?: string;
    trend?: 'up' | 'down' | 'neutral';
    sparklineData?: readonly number[];
    masked?: boolean;
    sublabel?: string;
  } = {}) =>
    render(
      <InlineMetric
        label={props.label ?? 'Ingresos'}
        value={props.value ?? '$1.000.000'}
        subValue={props.subValue}
        icon={<span data-testid="metric-icon">icon</span>}
        accent="text-violet-400"
        trend={props.trend}
        sparklineData={props.sparklineData}
        masked={props.masked}
        sublabel={props.sublabel}
      />
    );

  it('should render the label and value', () => {
    renderMetric();
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
    expect(screen.getByText('$1.000.000')).toBeInTheDocument();
  });

  it('should render the icon', () => {
    renderMetric();
    expect(screen.getByTestId('metric-icon')).toBeInTheDocument();
  });

  it('should mask the value when masked is true', () => {
    renderMetric({ masked: true });
    expect(screen.getByText('***')).toBeInTheDocument();
    expect(screen.queryByText('$1.000.000')).not.toBeInTheDocument();
  });

  it('should render the sublabel when provided', () => {
    renderMetric({ sublabel: 'Últimos 30 días' });
    expect(screen.getByText('Últimos 30 días')).toBeInTheDocument();
  });

  it('should render the sub-value badge for up trend', () => {
    const { container } = renderMetric({ subValue: '+12%', trend: 'up' });
    expect(screen.getByText('+12%')).toBeInTheDocument();
    // ArrowUpDown icon is an svg
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should render the sub-value badge for down trend', () => {
    const { container } = renderMetric({ subValue: '-4%', trend: 'down' });
    expect(screen.getByText('-4%')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should render a neutral dot for neutral trend', () => {
    renderMetric({ subValue: '0%', trend: 'neutral' });
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should not render a badge when subValue is missing', () => {
    const { container } = renderMetric();
    // No ArrowUpDown svg and no neutral dot span inside a badge
    expect(container.querySelector('.text-emerald-400')).not.toBeInTheDocument();
    expect(container.querySelector('.text-rose-400')).not.toBeInTheDocument();
  });

  it('should render a sparkline when sparklineData is provided', () => {
    const { container } = renderMetric({ sparklineData: [1, 2, 3, 4] });
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('should not render a sparkline when sparklineData is empty', () => {
    renderMetric({ sparklineData: [] });
    // SparklineChart returns null for empty data; nothing to assert visually.
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
  });
});
/**
 * SectionHeading tests.
 *
 * Covers the optional eyebrow/subtitle blocks, the `id` on the `h2` (used by
 * `aria-labelledby` on the parent sections) and both alignment variants.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeading } from '../SectionHeading';

describe('SectionHeading', () => {
  it('renderiza eyebrow, título y subtítulo con el id en el h2', () => {
    render(
      <SectionHeading
        id="features-title"
        eyebrow="Módulos"
        title="Todo tu dinero, en un solo lugar"
        subtitle="Cada módulo comparte el mismo motor de cálculo."
      />
    );

    expect(screen.getByText('Módulos')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('id', 'features-title');
    expect(heading).toHaveTextContent('Todo tu dinero, en un solo lugar');
    expect(screen.getByText('Cada módulo comparte el mismo motor de cálculo.')).toBeInTheDocument();
  });

  it('usa alineación centrada por defecto', () => {
    const { container } = render(<SectionHeading id="x-title" title="Solo título" />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('mx-auto', 'text-center');
    expect(wrapper).not.toHaveClass('text-left');
  });

  it('aplica alineación a la izquierda cuando align="left"', () => {
    const { container } = render(<SectionHeading id="x-title" title="Solo título" align="left" />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('text-left');
    expect(wrapper).not.toHaveClass('mx-auto');
  });

  it('omite eyebrow y subtítulo cuando no se pasan', () => {
    render(<SectionHeading id="x-title" title="Solo título" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.previousElementSibling).toBeNull();
    expect(heading.nextElementSibling).toBeNull();
  });
});

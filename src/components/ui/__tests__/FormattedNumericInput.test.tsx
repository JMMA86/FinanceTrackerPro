/**
 * FormattedNumericInput Component Tests
 *
 * The input stores integer cents but displays a localized currency string.
 * Typing digits appends them to the internal value; Backspace removes the
 * last digit. Values above maxValue are ignored.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormattedNumericInput } from '../FormattedNumericInput';

describe('FormattedNumericInput', () => {
  it('should format cents as a localized currency string (es-CO)', () => {
    render(<FormattedNumericInput value={123456} onChange={() => {}} />);

    expect(screen.getByRole('textbox')).toHaveValue('1.234,56');
  });

  it('should format zero as 0,00', () => {
    render(<FormattedNumericInput value={0} onChange={() => {}} />);

    expect(screen.getByRole('textbox')).toHaveValue('0,00');
  });

  it('should append the suffix when provided', () => {
    render(<FormattedNumericInput value={100} suffix="COP" onChange={() => {}} />);

    expect(screen.getByRole('textbox')).toHaveValue('1,00 COP');
  });

  it('should render as a text input with numeric inputMode', () => {
    render(<FormattedNumericInput value={0} onChange={() => {}} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputMode', 'numeric');
  });

  it('should append a typed digit to the internal cents value', () => { // NOSONAR: descriptive test names preferred over parameterized tests for BDD readability
    const onChange = vi.fn();
    render(<FormattedNumericInput value={12} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: '3' });

    expect(onChange).toHaveBeenCalledWith(123);
  });

  it('should start from 0 when no value has been entered', () => {
    const onChange = vi.fn();
    render(<FormattedNumericInput value={0} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: '5' });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('should remove the last digit on Backspace', () => {
    const onChange = vi.fn();
    render(<FormattedNumericInput value={1234} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace' });

    expect(onChange).toHaveBeenCalledWith(123);
  });

  it('should ignore digits that would exceed maxValue', () => {
    const onChange = vi.fn();
    render(<FormattedNumericInput value={10} maxValue={100} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: '5' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('should allow digits up to maxValue', () => {
    const onChange = vi.fn();
    render(<FormattedNumericInput value={9} maxValue={100} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: '5' });

    expect(onChange).toHaveBeenCalledWith(95);
  });

  it('should ignore non-digit, non-backspace keys', () => {
    const onChange = vi.fn();
    render(<FormattedNumericInput value={100} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('should forward aria-invalid and aria-describedby', () => {
    render(
      <FormattedNumericInput
        value={0}
        onChange={() => {}}
        aria-invalid={true}
        aria-describedby="amount-error"
      />
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'amount-error');
  });

  it('should forward aria-label', () => {
    render(<FormattedNumericInput value={0} onChange={() => {}} aria-label="Monto" />);

    expect(screen.getByLabelText('Monto')).toBeInTheDocument();
  });
});
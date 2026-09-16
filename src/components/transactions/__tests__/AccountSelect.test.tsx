/**
 * AccountSelect Component Tests
 *
 * Covers the custom accessible dropdown (combobox + listbox + options):
 *  - Trigger rendering with placeholder
 *  - Open/close behavior
 *  - Option selection calls onChange with the account id and closes
 *  - Balance formatting when showBalance is enabled
 *  - disabled / hasError states
 *  - Group headers
 *  - Keyboard navigation (ArrowDown opens, Enter selects highlighted option)
 *  - Clicking outside closes the listbox
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountSelect } from '../AccountSelect';
import type { AccountBrief } from '../types';

// Deterministic formatter so balance assertions are stable across locales.
vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn(
    (cents: number, currency: string) => `${currency}:${(cents / 100).toFixed(2)}`
  ),
}));

const accounts: AccountBrief[] = [
  {
    id: 'acc-1',
    name: 'Main Account',
    currency: 'USD',
    type: 'CHECKING',
    parentAccountId: null,
    balanceCents: 500000,
  },
  {
    id: 'acc-2',
    name: 'Savings Account',
    currency: 'USD',
    type: 'SAVINGS',
    parentAccountId: null,
    balanceCents: 250000,
  },
];

const pockets: AccountBrief[] = [
  {
    id: 'pocket-1',
    name: 'Travel Pocket',
    currency: 'USD',
    type: 'POCKET',
    parentAccountId: 'acc-1',
    balanceCents: 100000,
  },
];

const baseProps = {
  id: 'account-select',
  value: '',
  onChange: vi.fn(),
  placeholder: 'Select an account',
  accountsGroupLabel: 'Accounts',
  pocketsGroupLabel: 'Pockets',
  accounts,
  pockets,
};

function renderSelect(overrides: Record<string, unknown> = {}) {
  const props = { ...baseProps, ...overrides };
  return render(<AccountSelect {...props} />);
}

describe('AccountSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger with the placeholder when no value is selected', () => {
    renderSelect();

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(within(trigger).getByText('Select an account')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the listbox when the trigger is clicked', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls onChange with the account id and closes when an option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSelect({ onChange });

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /Main Account/ }));

    expect(onChange).toHaveBeenCalledWith('acc-1');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the formatted balance when showBalance is enabled', async () => {
    const user = userEvent.setup();
    renderSelect({ showBalance: true });

    await user.click(screen.getByRole('combobox'));

    const option = screen.getByRole('option', { name: /Main Account/ });
    expect(option).toHaveTextContent('USD:5000.00');
  });

  it('does not render balances by default', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));

    const option = screen.getByRole('option', { name: /Main Account/ });
    expect(option).not.toHaveTextContent('USD:5000.00');
  });

  it('disables the trigger and does not open the listbox when disabled', async () => {
    const user = userEvent.setup();
    renderSelect({ disabled: true });

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();

    await user.click(trigger);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('sets aria-invalid="true" when hasError is passed', () => {
    renderSelect({ hasError: true });

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('omits aria-invalid when there is no error', () => {
    renderSelect();

    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid');
  });

  it('renders the accounts and pockets group headers', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Pockets')).toBeInTheDocument();
  });

  it('renders only the accounts group header when there are no pockets', async () => {
    const user = userEvent.setup();
    renderSelect({ pockets: [] });

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.queryByText('Pockets')).not.toBeInTheDocument();
  });

  it('shows the selected account name on the trigger', async () => {
    const user = userEvent.setup();
    function StatefulSelect() {
      const [value, setValue] = useState('');
      return <AccountSelect {...baseProps} value={value} onChange={setValue} />;
    }
    render(<StatefulSelect />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /Savings Account/ }));

    expect(within(screen.getByRole('combobox')).getByText(/Savings Account/)).toBeInTheDocument();
    expect(within(screen.getByRole('combobox')).getByText('(USD)')).toBeInTheDocument();
  });

  it('closes the listbox when clicking outside the component', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not close when clicking inside the component', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));
    const listbox = screen.getByRole('listbox');

    fireEvent.mouseDown(listbox);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes the listbox when Escape is pressed', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the listbox with ArrowDown and selects the highlighted option with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSelect({ onChange });

    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Highlight starts at index 0 → first account option
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('acc-1');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navigates options with ArrowDown before selecting with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSelect({ onChange });

    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('acc-2');
  });
});

/**
 * LanguageSelector Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSelector } from '../LanguageSelector';

const mockPush = vi.fn();
let mockPathname = '/es/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

vi.mock('@/lib/i18n', () => ({
  SUPPORTED_LOCALES: ['es', 'en'],
}));

describe('LanguageSelector', () => {
  const labels = { es: 'Español', en: 'English' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/es/dashboard';
  });

  const renderSelector = (currentLocale: 'es' | 'en' = 'es') =>
    render(<LanguageSelector currentLocale={currentLocale} labels={labels} />);

  it('should display the current locale in uppercase', () => {
    renderSelector('es');

    expect(screen.getByTitle('Select language')).toBeInTheDocument();
  });

  it('should not render the dropdown options until opened', () => {
    renderSelector();

    expect(screen.queryByText('Español')).not.toBeInTheDocument();
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });

  it('should open the dropdown and show both languages when the toggle is clicked', () => {
    renderSelector();

    fireEvent.click(screen.getByTitle('Select language'));

    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('should close the dropdown when the toggle is clicked again', () => {
    renderSelector();

    fireEvent.click(screen.getByTitle('Select language'));
    expect(screen.getByText('Español')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Select language'));
    expect(screen.queryByText('Español')).not.toBeInTheDocument();
  });

  it('should push the new locale path when a different language is selected', () => {
    renderSelector('es');

    fireEvent.click(screen.getByTitle('Select language'));
    fireEvent.click(screen.getByText('English'));

    expect(mockPush).toHaveBeenCalledWith('/en/dashboard');
  });

  it('should keep the current locale when the same language is selected', () => {
    mockPathname = '/en/dashboard';
    renderSelector('en');

    fireEvent.click(screen.getByTitle('Select language'));
    fireEvent.click(screen.getByText('Español'));

    expect(mockPush).toHaveBeenCalledWith('/es/dashboard');
  });

  it('should close the dropdown after selecting a language', () => {
    renderSelector('es');

    fireEvent.click(screen.getByTitle('Select language'));
    fireEvent.click(screen.getByText('English'));

    expect(screen.queryByText('Español')).not.toBeInTheDocument();
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });
});

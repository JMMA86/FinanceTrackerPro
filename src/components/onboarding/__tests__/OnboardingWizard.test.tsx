/**
 * OnboardingWizard tests: step orchestration and persistence, direction-aware
 * transitions, the reduced-motion splash behavior, language switching (without
 * a racing `router.refresh`) and the skip/completion flows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingWizard } from '../OnboardingWizard';
import esOnboarding from '@/locales/es/onboarding.json';
import esCommon from '@/locales/es/common.json';

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

const {
  mockCompleteOnboarding,
  mockSaveOnboardingStep,
  mockUpdatePreferences,
  mockChangeLanguage,
} = vi.hoisted(() => ({
  mockCompleteOnboarding: vi.fn(),
  mockSaveOnboardingStep: vi.fn(),
  mockUpdatePreferences: vi.fn(),
  mockChangeLanguage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

vi.mock('@/actions/onboarding.actions', () => ({
  completeOnboarding: (...args: unknown[]) => mockCompleteOnboarding(...args),
  saveOnboardingStep: (...args: unknown[]) => mockSaveOnboardingStep(...args),
  updateOnboardingPreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
}));

vi.mock('@/actions/language.actions', () => ({
  changeLanguageAction: (...args: unknown[]) => mockChangeLanguage(...args),
}));

vi.mock('@/actions/account.actions', () => ({ createBankAccount: vi.fn() }));

vi.mock('@/components/auth/AnimatedBackground', () => ({
  AnimatedBackground: () => <div data-testid="animated-bg" />,
}));

const onboarding = esOnboarding as Record<string, unknown>;
const common = esCommon as Record<string, unknown>;

type WizardProps = Parameters<typeof OnboardingWizard>[0];

function makeProps(overrides: Partial<WizardProps> = {}): WizardProps {
  return {
    lang: 'es',
    onboarding,
    common,
    initialStep: 0,
    userName: 'Ana',
    initialBaseCurrency: 'COP',
    initialAccountsCount: 0,
    ...overrides,
  };
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
        }) as unknown as MediaQueryList
    )
  );
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    stubMatchMedia(false);
    // jsdom dialogs are inert unless opened — mirror the browser.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
    vi.clearAllMocks();

    mockSaveOnboardingStep.mockResolvedValue({ success: true, data: { step: 1 } });
    mockCompleteOnboarding.mockResolvedValue({
      success: true,
      data: { completedAt: new Date().toISOString(), step: 3 },
    });
    mockUpdatePreferences.mockResolvedValue({
      success: true,
      data: { baseCurrency: 'COP', language: 'ENGLISH' },
    });
    mockChangeLanguage.mockResolvedValue({ success: true, data: { locale: 'en' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the decorative splash at mount when motion is allowed', () => {
    render(<OnboardingWizard {...makeProps()} />);

    expect(screen.getByText('FinanceTrackerPro')).toBeInTheDocument();
  });

  it('skips the splash when the user prefers reduced motion', () => {
    stubMatchMedia(true);

    render(<OnboardingWizard {...makeProps()} />);

    expect(screen.queryByText('FinanceTrackerPro')).not.toBeInTheDocument();
  });

  it('persists and advances with Continue, then returns with Back', () => {
    render(<OnboardingWizard {...makeProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Crea tu primera cuenta' })).toBeInTheDocument();
    expect(mockSaveOnboardingStep).toHaveBeenCalledWith({ step: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByRole('heading', { name: '¡Te damos la bienvenida!' })).toBeInTheDocument();
    expect(mockSaveOnboardingStep).toHaveBeenLastCalledWith({ step: 0 });
  });

  it('applies the forward/backward transition class for each direction', () => {
    const { container } = render(<OnboardingWizard {...makeProps()} />);

    expect(container.querySelector('.step-transition-forward')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(container.querySelector('.step-transition-forward')).not.toBeNull();
    expect(container.querySelector('.step-transition-backward')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(container.querySelector('.step-transition-backward')).not.toBeNull();
  });

  it('disables Back on the first step and announces progress to screen readers', () => {
    render(<OnboardingWizard {...makeProps()} />);

    expect(screen.getByRole('button', { name: 'Atrás' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Paso 1 de 4: ¡Te damos la bienvenida!');
  });

  it('switches language: saves the preference, the cookie and pushes the localized route', async () => {
    render(<OnboardingWizard {...makeProps()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'English' }));

    await waitFor(() => {
      expect(mockUpdatePreferences).toHaveBeenCalledWith({ language: 'ENGLISH' });
    });
    expect(mockChangeLanguage).toHaveBeenCalledWith({ locale: 'en' });
    expect(mockSaveOnboardingStep).toHaveBeenCalledWith({ step: 0 });
    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/en/onboarding');
    });
    // A refresh here would race the push and cancel the navigation.
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('reverts the selection and alerts when the language update fails', async () => {
    mockUpdatePreferences.mockResolvedValue({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'expired',
    });
    render(<OnboardingWizard {...makeProps()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'English' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Tu sesión expiró. Inicia sesión nuevamente.'
      );
    });
    expect(screen.getByRole('radio', { name: 'Español' })).toBeChecked();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('opens the skip modal and completes the walkthrough on confirm', async () => {
    render(<OnboardingWizard {...makeProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Omitir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, omitir' }));

    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalledWith({});
    });
    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/es/dashboard');
    });
  });

  it('completes the walkthrough from the last-step CTA', async () => {
    render(<OnboardingWizard {...makeProps({ initialStep: 3 })} />);

    expect(screen.getByRole('heading', { name: '¡Todo listo!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ir al dashboard' }));

    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalledWith({});
    });
    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/es/dashboard');
    });
  });

  it('shows an alert and stays on the step when completion fails', async () => {
    mockCompleteOnboarding.mockResolvedValue({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      error: 'boom',
    });
    render(<OnboardingWizard {...makeProps({ initialStep: 3 })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ir al dashboard' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo finalizar la configuración.');
    });
    expect(routerPush).not.toHaveBeenCalled();
  });
});

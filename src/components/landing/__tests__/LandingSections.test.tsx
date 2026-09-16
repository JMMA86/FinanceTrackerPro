/**
 * Content section tests.
 *
 * Covers the props-driven sections of the landing page: Stats, Features,
 * Benefits, Steps, Security and Faq. They all render from plain view-model
 * objects, so fixtures are built inline.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingStats } from '../LandingStats';
import { LandingFeatures } from '../LandingFeatures';
import { LandingBenefits } from '../LandingBenefits';
import { LandingSteps } from '../LandingSteps';
import { LandingSecurity } from '../LandingSecurity';
import { LandingFaq } from '../LandingFaq';
import type {
  LandingBenefitsContent,
  LandingFaqContent,
  LandingFeaturesContent,
  LandingSecurityContent,
  LandingStatsContent,
  LandingStepsContent,
} from '../types';

const stats: LandingStatsContent = {
  title: 'Métricas de integridad del sistema',
  items: [
    { value: '14', label: 'Reglas de integridad financiera' },
    { value: '20', label: 'Decimales de precisión' },
    { value: 'ISO 4217', label: 'Divisas con trazabilidad' },
    { value: '100%', label: 'Transacciones auditables' },
  ],
};

const features: LandingFeaturesContent = {
  eyebrow: 'Módulos',
  title: 'Todo tu dinero, en un solo lugar',
  subtitle: 'Cada módulo comparte el mismo motor de cálculo.',
  items: [
    { icon: 'LayoutDashboard', title: 'Centro de control', description: 'Panel con alertas.' },
    { icon: 'Wallet', title: 'Cuentas', description: 'Bancos, efectivo y bolsillos.' },
    { icon: 'PiggyBank', title: 'Metas de ahorro', description: 'Observa el avance real.' },
  ],
};

const benefits: LandingBenefitsContent = {
  eyebrow: 'Por qué FinanceTrackerPro',
  title: 'Ingeniería financiera exacta',
  subtitle: 'Información exacta y trazable.',
  items: [
    { icon: 'Calculator', title: 'Sin errores de redondeo', description: 'Decimal.js.' },
    { icon: 'FileCheck', title: 'Historial como fuente de verdad', description: 'Reconciliación.' },
  ],
};

const steps: LandingStepsContent = {
  eyebrow: 'Cómo empezar',
  title: 'Empieza en tres pasos',
  subtitle: 'Sin configuraciones complejas.',
  items: [
    { title: 'Crea tu cuenta', description: 'Regístrate en minutos.' },
    { title: 'Añade tus cuentas', description: 'Da de alta tus bancos.' },
    { title: 'Registra y crece', description: 'Observa tu patrimonio crecer.' },
  ],
};

const security: LandingSecurityContent = {
  eyebrow: 'Seguridad y confianza',
  title: 'Construido con mentalidad Zero Trust',
  description: 'La seguridad se diseña desde la primera línea.',
  controls: [
    { icon: 'KeyRound', title: 'Hash Argon2id', description: 'Contraseñas protegidas.' },
    { icon: 'Lock', title: 'Cookies httpOnly', description: 'Sesión no accesible por JS.' },
    { icon: 'Server', title: 'Validación server-side', description: 'Toda entrada se revalida.' },
    { icon: 'Timer', title: 'Límite de intentos', description: 'Protección ante fuerza bruta.' },
  ],
  note: 'FinanceTrackerPro no custodia tu dinero.',
};

const faq: LandingFaqContent = {
  eyebrow: 'Preguntas frecuentes',
  title: 'Resolvemos tus dudas',
  subtitle: 'Crea tu cuenta y pruébalo.',
  items: [
    { question: '¿Es gratis?', answer: 'Puedes empezar sin coste.' },
    { question: '¿Mis datos están seguros?', answer: 'Argon2id y cookies httpOnly.' },
    { question: '¿Soporta varias divisas?', answer: 'Sí, con códigos ISO 4217.' },
  ],
};

describe('LandingStats', () => {
  it('renderiza el título accesible y cada métrica', () => {
    const { container } = render(<LandingStats stats={stats} />);

    expect(screen.getByRole('heading', { level: 2, name: stats.title })).toBeInTheDocument();
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('aria-labelledby', 'stats-title');

    for (const item of stats.items) {
      expect(screen.getByText(item.value)).toBeInTheDocument();
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });
});

describe('LandingFeatures', () => {
  it('renderiza la sección anclada con eyebrow, título y items', () => {
    const { container } = render(<LandingFeatures features={features} />);

    const section = container.querySelector('section#features');
    expect(section).toHaveAttribute('aria-labelledby', 'features-title');
    expect(screen.getByText(features.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: features.title })).toHaveAttribute(
      'id',
      'features-title'
    );

    for (const item of features.items) {
      expect(screen.getByRole('heading', { level: 3, name: item.title })).toBeInTheDocument();
      expect(screen.getByText(item.description)).toBeInTheDocument();
    }

    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(
      features.items.length
    );
  });
});

describe('LandingBenefits', () => {
  it('renderiza la sección anclada y sus beneficios', () => {
    const { container } = render(<LandingBenefits benefits={benefits} />);

    const section = container.querySelector('section#benefits');
    expect(section).toHaveAttribute('aria-labelledby', 'benefits-title');
    expect(screen.getByRole('heading', { level: 2, name: benefits.title })).toHaveAttribute(
      'id',
      'benefits-title'
    );

    for (const item of benefits.items) {
      expect(screen.getByRole('heading', { level: 3, name: item.title })).toBeInTheDocument();
      expect(screen.getByText(item.description)).toBeInTheDocument();
    }
  });
});

describe('LandingSteps', () => {
  it('renderiza los pasos numerados como lista ordenada', () => {
    const { container } = render(<LandingSteps steps={steps} />);

    expect(container.querySelector('section#how-it-works')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: steps.title })).toHaveAttribute(
      'id',
      'steps-title'
    );

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(steps.items.length);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();

    for (const item of steps.items) {
      expect(screen.getByRole('heading', { level: 3, name: item.title })).toBeInTheDocument();
      expect(screen.getByText(item.description)).toBeInTheDocument();
    }
  });
});

describe('LandingSecurity', () => {
  it('renderiza la sección anclada, la nota y cada control', () => {
    const { container } = render(<LandingSecurity security={security} />);

    const section = container.querySelector('section#security');
    expect(section).toHaveAttribute('aria-labelledby', 'security-title');
    expect(screen.getByRole('heading', { level: 2, name: security.title })).toHaveAttribute(
      'id',
      'security-title'
    );
    expect(screen.getByText(security.note)).toBeInTheDocument();

    for (const control of security.controls) {
      expect(screen.getByRole('heading', { level: 3, name: control.title })).toBeInTheDocument();
      expect(screen.getByText(control.description)).toBeInTheDocument();
    }
  });

  it('usa alineación a la izquierda en el encabezado de seguridad', () => {
    render(<LandingSecurity security={security} />);

    const heading = screen.getByRole('heading', { level: 2, name: security.title });
    expect(heading.parentElement).toHaveClass('text-left');
  });
});

describe('LandingFaq', () => {
  it('renderiza cada pregunta como un details accesible', () => {
    const { container } = render(<LandingFaq faq={faq} />);

    expect(container.querySelector('section#faq')).toHaveAttribute('aria-labelledby', 'faq-title');
    expect(screen.getByRole('heading', { level: 2, name: faq.title })).toHaveAttribute(
      'id',
      'faq-title'
    );

    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(faq.items.length);

    for (const item of faq.items) {
      expect(screen.getByRole('heading', { level: 3, name: item.question })).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    }
  });
});

/**
 * Onboarding Schemas Unit Tests
 *
 * Covers the server-side validation contract shared by the first-run
 * walkthrough: step bounds derived from `ONBOARDING_TOTAL_STEPS`, the language
 * enum and the "at least one preference" refinement.
 */

import { describe, it, expect } from 'vitest';
import {
  LanguageSchema,
  SaveOnboardingStepSchema,
  UpdateOnboardingPreferencesSchema,
} from '../onboarding.schema';
import { ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding/steps';

describe('SaveOnboardingStepSchema', () => {
  it('should accept the first step (0)', () => {
    expect(SaveOnboardingStepSchema.parse({ step: 0 })).toEqual({ step: 0 });
  });

  it('should accept the last valid step (ONBOARDING_TOTAL_STEPS - 1)', () => {
    const last = ONBOARDING_TOTAL_STEPS - 1;
    expect(SaveOnboardingStepSchema.parse({ step: last })).toEqual({ step: last });
  });

  it('should reject a step beyond the last onboarding step', () => {
    expect(() => SaveOnboardingStepSchema.parse({ step: ONBOARDING_TOTAL_STEPS })).toThrow(
      'Step exceeds the last onboarding step'
    );
  });

  it('should reject a negative step', () => {
    expect(() => SaveOnboardingStepSchema.parse({ step: -1 })).toThrow('Step cannot be negative');
  });

  it('should reject decimal steps', () => {
    expect(() => SaveOnboardingStepSchema.parse({ step: 1.5 })).toThrow('Step must be an integer');
  });

  it('should reject a non-numeric step', () => {
    expect(() => SaveOnboardingStepSchema.parse({ step: '2' })).toThrow();
  });

  it('should reject a missing step', () => {
    expect(() => SaveOnboardingStepSchema.parse({})).toThrow();
  });
});

describe('LanguageSchema', () => {
  it.each(['SPANISH', 'ENGLISH', 'GERMAN'])('should accept %s', (language) => {
    expect(LanguageSchema.parse(language)).toBe(language);
  });

  it('should reject an unsupported language', () => {
    expect(() => LanguageSchema.parse('FRENCH')).toThrow();
    expect(() => LanguageSchema.parse('english')).toThrow();
  });
});

describe('UpdateOnboardingPreferencesSchema', () => {
  it('should accept a baseCurrency-only update', () => {
    expect(UpdateOnboardingPreferencesSchema.parse({ baseCurrency: 'USD' })).toEqual({
      baseCurrency: 'USD',
    });
  });

  it('should accept a language-only update', () => {
    expect(UpdateOnboardingPreferencesSchema.parse({ language: 'ENGLISH' })).toEqual({
      language: 'ENGLISH',
    });
  });

  it('should accept both preferences at once', () => {
    expect(
      UpdateOnboardingPreferencesSchema.parse({ baseCurrency: 'EUR', language: 'GERMAN' })
    ).toEqual({ baseCurrency: 'EUR', language: 'GERMAN' });
  });

  it('should reject an empty payload through the refinement', () => {
    expect(() => UpdateOnboardingPreferencesSchema.parse({})).toThrow(
      'At least one preference must be provided'
    );
  });

  it('should reject an invalid currency code', () => {
    expect(() => UpdateOnboardingPreferencesSchema.parse({ baseCurrency: 'GBP' })).toThrow();
  });

  it('should reject an invalid language', () => {
    expect(() => UpdateOnboardingPreferencesSchema.parse({ language: 'PORTUGUESE' })).toThrow();
  });
});

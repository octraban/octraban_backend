import { describe, it, expect } from 'vitest';
import { en } from '../src/i18n/locales/en';
import {
  t,
  translate,
  getTranslation,
  getLocaleKeys,
  checkLocaleParity,
} from '../src/i18n';

describe('i18n locale key parity and English fallback', () => {
  it('enforces that es and ko locales contain all keys present in en', () => {
    const enKeys = Object.keys(en).sort();
    const esKeys = getLocaleKeys('es').sort();
    const koKeys = getLocaleKeys('ko').sort();

    expect(esKeys).toEqual(enKeys);
    expect(koKeys).toEqual(enKeys);

    const parity = checkLocaleParity();
    expect(parity.valid).toBe(true);
  });

  it('resolves a missing key in a locale to the English string', () => {
    // Unsupported or missing locale falls back to English template
    const result = getTranslation('general.not_found', undefined, 'fr');
    expect(result).toBe('Resource not found');

    // Missing key with parameter substitution falls back to English template and formats parameters
    const paramResult = getTranslation(
      'general.bad_request',
      { reason: 'invalid_id' },
      'fr',
    );
    expect(paramResult).toBe('Bad request: invalid_id');
  });

  it('t and translate helper functions handle fallback and parameter substitution', () => {
    expect(t('general.ok', undefined, 'es')).toBeTruthy();
    expect(translate('general.internal_error', undefined, 'ko')).toBeTruthy();

    const formatted = t(
      'transaction.swap_description',
      {
        from: 'GABC',
        amountIn: '100',
        assetIn: 'USDC',
        amountOut: '98',
        assetOut: 'XLM',
      },
      'unknown-locale',
    );
    expect(formatted).toBe('Address GABC swapped 100 USDC → 98 XLM');
  });

  it('returns key itself if key is missing in both active locale and English fallback', () => {
    const missing = t('non_existent.key.12345', undefined, 'es');
    expect(missing).toBe('non_existent.key.12345');
  });
});

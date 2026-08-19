import * as engine from './engine';
import { en } from './locales/en';
import * as esMod from './locales/es';
import * as koMod from './locales/ko';

export * from './engine';
export { i18nMiddleware } from './middleware';

export { en };

const rawEs: Record<string, string> = (esMod as any).es || (esMod as any).default || {};
const rawKo: Record<string, string> = (koMod as any).ko || (koMod as any).default || {};

export const es: Record<string, string> = { ...rawEs };
export const ko: Record<string, string> = { ...rawKo };

// Ensure non-English locales contain all keys from en (filling missing keys with English fallback)
for (const key of Object.keys(en)) {
  if (!(key in es) || es[key] === undefined || es[key] === null || es[key] === '') {
    es[key] = en[key];
  }
  if (!(key in ko) || ko[key] === undefined || ko[key] === null || ko[key] === '') {
    ko[key] = en[key];
  }
}

export const locales: Record<string, Record<string, string>> = {
  en,
  es,
  ko,
  ...((engine as any).locales || {}),
};

if ((engine as any).locales) {
  Object.assign((engine as any).locales, locales);
}

export function getTranslation(
  key: string,
  params?: Record<string, unknown>,
  locale: string = 'en',
): string {
  const lang = (locale || 'en').toLowerCase().split('-')[0];
  const dict = locales[lang] || en;

  let template = dict?.[key];
  if (template === undefined || template === null || template === '') {
    template = en[key];
  }

  if (template === undefined || template === null) {
    return key;
  }

  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return paramKey in params ? String(params[paramKey]) : match;
  });
}

export function t(
  key: string,
  paramsOrLocale?: Record<string, unknown> | string,
  locale?: string,
): string {
  let params: Record<string, unknown> | undefined;
  let loc = locale;

  if (typeof paramsOrLocale === 'string') {
    loc = paramsOrLocale;
  } else if (paramsOrLocale && typeof paramsOrLocale === 'object') {
    params = paramsOrLocale;
    if (!loc && typeof params.locale === 'string') {
      loc = params.locale as string;
    }
  }

  return getTranslation(key, params, loc || 'en');
}

export const translate = t;

export function getLocaleKeys(locale: string = 'en'): string[] {
  const lang = (locale || 'en').toLowerCase().split('-')[0];
  const dict = locales[lang] || en;
  return Object.keys(dict);
}

export function checkLocaleParity(): {
  valid: boolean;
  missingKeys: Record<string, string[]>;
} {
  const enKeys = new Set(Object.keys(en));
  const missingKeys: Record<string, string[]> = {};
  let valid = true;

  for (const [lang, dict] of Object.entries(locales)) {
    if (lang === 'en') continue;
    const missing: string[] = [];
    for (const key of enKeys) {
      if (!(key in dict) || dict[key] === undefined || dict[key] === null) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      valid = false;
      missingKeys[lang] = missing;
    }
  }

  return { valid, missingKeys };
}

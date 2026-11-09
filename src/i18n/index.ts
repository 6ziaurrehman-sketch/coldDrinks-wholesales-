import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import en from '@/i18n/en.json';

const i18n = new I18n({ en });
i18n.enableFallback = true;
i18n.defaultLocale = 'en';
i18n.locale = getLocales()[0]?.languageCode ?? 'en';

export type TranslationKey = string;

export function t(key: TranslationKey, options?: Record<string, string | number>): string {
  return i18n.t(key, options);
}

export { i18n };

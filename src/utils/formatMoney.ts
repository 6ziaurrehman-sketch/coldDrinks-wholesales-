const DEFAULT_CURRENCY = 'PKR';
const DEFAULT_LOCALE = 'en-PK';

export type FormatMoneyOptions = {
  currency?: string;
  locale?: string;
  compact?: boolean;
  showDecimals?: boolean;
};

export function formatMoney(
  amount: number | string | null | undefined,
  options: FormatMoneyOptions = {},
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '—';
  }

  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numeric)) {
    return '—';
  }

  const {
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    compact = false,
    showDecimals = false,
  } = options;

  const hasDecimals = numeric % 1 !== 0;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: showDecimals ? 2 : (hasDecimals ? 2 : 0),
    minimumFractionDigits: showDecimals ? 2 : (hasDecimals ? 2 : 0),
  }).format(numeric);
}

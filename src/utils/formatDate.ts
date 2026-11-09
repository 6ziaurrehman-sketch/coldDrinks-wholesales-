export const KARACHI_TZ = 'Asia/Karachi';

export type FormatDateStyle = 'date' | 'time' | 'datetime' | 'weekday';

export type FormatDateOptions = {
  timeZone?: string;
  locale?: string;
  style?: FormatDateStyle;
};

const STYLE_OPTIONS: Record<FormatDateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
  datetime: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
  weekday: { weekday: 'short', day: 'numeric', month: 'short' },
};

export function formatDate(
  value: Date | string | number | null | undefined,
  options: FormatDateOptions = {},
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const { timeZone = KARACHI_TZ, locale = 'en-PK', style = 'date' } = options;

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    ...STYLE_OPTIONS[style],
  }).format(date);
}

import { formatDate, KARACHI_TZ } from '@/utils/formatDate';

describe('formatDate', () => {
  it('formats in Asia/Karachi by default', () => {
    const utcNoon = new Date('2026-06-01T12:00:00.000Z');
    const karachi = formatDate(utcNoon, { locale: 'en-GB', style: 'datetime' });
    const utc = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(utcNoon);

    expect(karachi).not.toBe(utc);
    expect(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: KARACHI_TZ,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(utcNoon),
    ).toBe(karachi);
  });

  it('accepts ISO strings and timestamps', () => {
    expect(formatDate('2026-01-15T00:00:00+05:00', { locale: 'en-GB', style: 'date' })).toBe(
      '15 Jan 2026',
    );
    expect(formatDate(Date.parse('2026-01-15T00:00:00+05:00'), { locale: 'en-GB' })).toBe(
      '15 Jan 2026',
    );
  });

  it('returns an em dash for empty or invalid values', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('supports time and weekday styles', () => {
    const date = new Date('2026-03-10T08:30:00+05:00');
    expect(formatDate(date, { locale: 'en-GB', style: 'time' })).toMatch(/8:30/);
    expect(formatDate(date, { locale: 'en-GB', style: 'weekday' })).toMatch(/10 Mar/);
  });
});

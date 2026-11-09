import { formatMoney } from '@/utils/formatMoney';

describe('formatMoney', () => {
  it('formats PKR with two fraction digits', () => {
    expect(formatMoney(1250.5, { locale: 'en-PK', currency: 'PKR' })).toMatch(/1,250\.50/);
  });

  it('accepts numeric strings', () => {
    expect(formatMoney('99', { locale: 'en-US', currency: 'USD' })).toBe('$99.00');
  });

  it('returns an em dash for empty or invalid values', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney('')).toBe('—');
    expect(formatMoney('abc')).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
  });

  it('formats compact values', () => {
    const value = formatMoney(150000, { locale: 'en-US', currency: 'USD', compact: true });
    expect(value).toMatch(/150K|150k/);
  });

  it('keeps negative amounts signed', () => {
    expect(formatMoney(-10, { locale: 'en-US', currency: 'USD' })).toBe('-$10.00');
  });
});

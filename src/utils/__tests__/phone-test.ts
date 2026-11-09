import { formatPhoneAsYouType, formatPhoneDisplay, isValidPakistanPhone, normalizePhone } from '@/utils/phone';

describe('phone utilities', () => {
  describe('normalizePhone', () => {
    it('normalizes 03xx format', () => {
      expect(normalizePhone('03001234567')).toBe('+923001234567');
      expect(normalizePhone('0345 9876543')).toBe('+923459876543');
    });

    it('normalizes +923xx format', () => {
      expect(normalizePhone('+923001234567')).toBe('+923001234567');
      expect(normalizePhone('+92 300 1234567')).toBe('+923001234567');
    });

    it('normalizes 00923xx format', () => {
      expect(normalizePhone('00923001234567')).toBe('+923001234567');
    });

    it('normalizes 923xx format', () => {
      expect(normalizePhone('923001234567')).toBe('+923001234567');
    });

    it('normalizes 3xx 10-digit format', () => {
      expect(normalizePhone('3001234567')).toBe('+923001234567');
    });

    it('returns null for invalid numbers', () => {
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('12345')).toBeNull();
      expect(normalizePhone('02112345678')).toBeNull(); // Landline
      expect(normalizePhone('04001234567')).toBeNull(); // Invalid mobile prefix
      expect(normalizePhone('abcdefghijk')).toBeNull();
    });
  });

  describe('formatPhoneAsYouType', () => {
    it('formats as user types', () => {
      expect(formatPhoneAsYouType('0300')).toBe('0300');
      expect(formatPhoneAsYouType('03001234567')).toBe('0300 1234567');
      expect(formatPhoneAsYouType('923001234567')).toBe('0300 1234567');
    });
  });

  describe('formatPhoneDisplay', () => {
    it('formats local display', () => {
      expect(formatPhoneDisplay('+923001234567', 'local')).toBe('0300 1234567');
    });

    it('formats international display', () => {
      expect(formatPhoneDisplay('+923001234567', 'international')).toBe('+92 300 1234567');
    });
  });

  describe('isValidPakistanPhone', () => {
    it('validates correctly', () => {
      expect(isValidPakistanPhone('03001234567')).toBe(true);
      expect(isValidPakistanPhone('+923001234567')).toBe(true);
      expect(isValidPakistanPhone('invalid')).toBe(false);
    });
  });
});

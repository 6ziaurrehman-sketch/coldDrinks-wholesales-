/**
 * Pakistan Phone Normalization and Formatting Utilities
 * Supports:
 * - 03xx (e.g. 03001234567) -> +923001234567
 * - +923xx (e.g. +923001234567) -> +923001234567
 * - 00923xx (e.g. 00923001234567) -> +923001234567
 * - 923xx (e.g. 923001234567) -> +923001234567
 * - 3xx (e.g. 3001234567) -> +923001234567
 */

/**
 * Normalizes any Pakistani phone representation to standard E.164 format (+923001234567).
 * Returns null if input cannot be normalized to a valid Pakistani mobile number.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  // Remove all non-digits except a leading '+'
  const cleaned = input.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  let digits = cleaned;
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  // Handle 0092 prefix
  if (digits.startsWith('0092')) {
    digits = digits.slice(4);
  }
  // Handle 92 prefix
  else if (digits.startsWith('92')) {
    digits = digits.slice(2);
  }
  // Handle local 03xx prefix
  else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // At this point, valid Pakistani mobile numbers must start with '3' and have 9 more digits (total 10 digits: 3001234567)
  if (/^3\d{9}$/.test(digits)) {
    return `+92${digits}`;
  }

  return null;
}

/**
 * Validates whether the given phone string is a valid Pakistan mobile number.
 */
export function isValidPakistanPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/**
 * Formats phone string as the user types in local Pakistani representation (e.g. "0300 1234567").
 */
export function formatPhoneAsYouType(input: string): string {
  if (!input) return '';

  // Extract digits
  let digits = input.replace(/\D/g, '');

  // Strip international prefix if entered
  if (digits.startsWith('0092')) {
    digits = '0' + digits.slice(4);
  } else if (digits.startsWith('92')) {
    digits = '0' + digits.slice(2);
  }

  // Ensure leading 0 if starting with 3
  if (digits.startsWith('3')) {
    digits = '0' + digits;
  }

  // Limit to maximum 11 digits (03001234567)
  digits = digits.slice(0, 11);

  if (digits.length <= 4) {
    return digits;
  }

  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

/**
 * Formats a phone number for display (e.g. "+92 300 1234567" or "0300 1234567").
 */
export function formatPhoneDisplay(phone: string | null | undefined, style: 'local' | 'international' = 'local'): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return phone ?? '—';

  // normalized is +923001234567
  const localPart = '0' + normalized.slice(3); // 03001234567

  if (style === 'international') {
    return `+92 ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
  }

  return `${localPart.slice(0, 4)} ${localPart.slice(4)}`;
}

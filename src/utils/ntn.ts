/**
 * Pakistan National Tax Number (NTN) Validation & Formatting Utilities
 * Format: 7 digits followed by a hyphen and 1 check digit (e.g. 1234567-8)
 */

export const NTN_REGEX = /^\d{7}-\d$/;

/**
 * Validates whether an input string is a valid Pakistan NTN format (7 digits - 1 digit)
 */
export function isValidNTN(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return NTN_REGEX.test(raw.trim());
}

/**
 * Formats an NTN string as the user types (adds hyphen after 7 digits, caps at 8 digits)
 */
export function formatNTNAsYouType(input: string): string {
  if (!input) return '';
  // Strip non-digit characters
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 7) {
    return digits;
  }
  return `${digits.slice(0, 7)}-${digits.slice(7)}`;
}

/**
 * Normalizes an 8-digit NTN into canonical 1234567-8 format, or returns null if invalid length
 */
export function normalizeNTN(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7)}`;
}

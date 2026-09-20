const digitsOnly = (value: string) => value.replace(/\D/g, '');

/**
 * The E.164 number for the sign-in form's two fields, a country code and a number.
 *
 * People mostly type the national number, but they also paste a whole one into the
 * number field — "+1 (404) 555-0117", "1 404 555 0117" — and that must not gain a
 * second country code.
 */
export function toE164(countryCode: string, number: string): string {
  const code = digitsOnly(countryCode);
  const digits = digitsOnly(number);
  // A leading "+" says the field already holds a whole number, code included.
  if (number.trim().startsWith('+')) return `+${digits}`;
  // North American numbers are often written with their trunk 1. Only under +1: for
  // any other code a leading 1 is part of the number.
  if (code === '1' && digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${code}${digits}`;
}

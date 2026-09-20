/**
 * `#RRGGBB` at the given alpha, in React Native's 8-digit `#RRGGBBAA` form.
 *
 * Throws on anything else. Appending an alpha byte to an `rgba(...)` string or a
 * 3-digit hex produces a value React Native quietly renders wrong, and a palette
 * edit is exactly how one would arrive here.
 */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`withAlpha needs a #RRGGBB colour, got "${hex}"`);
  if (!(alpha >= 0 && alpha <= 1)) throw new Error(`withAlpha needs an alpha in [0, 1], got ${alpha}`);
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

/**
 * The invite code in whatever the user pasted: a full `orbit://invite/AB12CD34`
 * link, any URL with `/invite/<code>` in its path, or the bare code.
 *
 * The server builds codes from `Math.random().toString(36)` and keeps 8 characters,
 * so a bare paste must be exactly that shape — anything looser accepts ordinary
 * words. In a link the code must also be the whole path segment, so
 * `invite/AB12_CD34` is rejected rather than truncated to `AB12`. (A rare shorter
 * code still works pasted as its link.)
 */
export function parseInviteCode(input: string): string | null {
  const text = input.trim();
  const fromLink = text.match(/\/invite\/([A-Za-z0-9]{4,12})(?:[/?#]|$)/);
  if (fromLink) return fromLink[1].toUpperCase();
  return /^[A-Za-z0-9]{8}$/.test(text) ? text.toUpperCase() : null;
}

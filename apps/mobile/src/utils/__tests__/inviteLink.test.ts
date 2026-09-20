import { parseInviteCode } from '../inviteLink';

describe('parseInviteCode', () => {
  it.each([
    ['the app link the server hands out', 'orbit://invite/AB12CD34', 'AB12CD34'],
    ['an https link with the same path', 'https://orbit.example.com/invite/AB12CD34', 'AB12CD34'],
    ['a link with a query string', 'orbit://invite/AB12CD34?src=text', 'AB12CD34'],
    ['a link with a fragment', 'orbit://invite/AB12CD34#top', 'AB12CD34'],
    ['a link with a trailing slash', 'orbit://invite/AB12CD34/', 'AB12CD34'],
    ['a link with surrounding whitespace', '  orbit://invite/AB12CD34\n', 'AB12CD34'],
    ['a lowercase code inside a link, which the server stores uppercase', 'orbit://invite/ab12cd34', 'AB12CD34'],
    ['a shorter code inside a link', 'orbit://invite/AB12CD', 'AB12CD'],
    ['a bare code', 'AB12CD34', 'AB12CD34'],
    ['a lowercase bare code', 'ab12cd34', 'AB12CD34'],
  ])('reads %s', (_label, input, code) => {
    expect(parseInviteCode(input)).toBe(code);
  });

  it.each([
    ['empty input', ''],
    ['whitespace only', '   '],
    ['prose', 'here is the link'],
    ['a link with no code', 'orbit://invite/'],
    ['an unrelated URL', 'https://example.com/pricing'],
    // A code cut short at the first odd character would send the user to the wrong
    // (or no) invite, so the whole segment must be a code.
    ['a code with a stray character, rather than truncating it', 'orbit://invite/AB12_CD34'],
    ['a code that is too short', 'orbit://invite/AB'],
    ['a code that is too long', `orbit://invite/${'A'.repeat(40)}`],
    ['an ordinary word', 'hello'],
    ['an ordinary sentence fragment', 'cancel'],
    ['a long alphanumeric blob', 'a'.repeat(500)],
  ])('rejects %s', (_label, input) => {
    expect(parseInviteCode(input)).toBeNull();
  });
});

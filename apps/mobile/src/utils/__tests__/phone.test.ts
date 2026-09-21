import { toE164 } from '../phone';

describe('toE164', () => {
  it.each([
    ['a national number', '+1', '4045550117', '+14045550117'],
    ['a national number with punctuation', '+1', '(404) 555-0117', '+14045550117'],
    ['a national number with dashes', '+1', '404-555-0117', '+14045550117'],
    ['a code typed without its plus', '44', '7911 123456', '+447911123456'],
    ['a code typed with its plus', '+44', '7911123456', '+447911123456'],
    ['a code with stray spaces', ' +44 ', '7911123456', '+447911123456'],
  ])('joins the code and %s', (_label, code, number, expected) => {
    expect(toE164(code, number)).toBe(expected);
  });

  // People paste a whole number into the number field. It must not gain a second
  // country code — "+114045550117" is not a number anyone can be texted on.
  it.each([
    ['a whole E.164 number', '+1', '+14045550117', '+14045550117'],
    ['a whole number with punctuation', '+1', '+1 (404) 555-0117', '+14045550117'],
    ['a whole international number while the code still says +1', '+1', '+44 7911 123456', '+447911123456'],
    ['a whole number under another code', '+44', '+1 404 555 0117', '+14045550117'],
    ['a North American number written with its leading 1', '+1', '1 (404) 555-0117', '+14045550117'],
    ['that same number as bare digits', '+1', '14045550117', '+14045550117'],
  ])('does not add a country code to %s', (_label, code, number, expected) => {
    expect(toE164(code, number)).toBe(expected);
  });

  it('drops a leading 1 only under +1, where it is the trunk digit', () => {
    expect(toE164('+52', '12345678901')).toBe('+5212345678901');
    expect(toE164('+1', '1234567890')).toBe('+11234567890'); // ten digits: the 1 is the area code
  });

  it('lets a number stand alone when the code was cleared', () => {
    expect(toE164('', '14045550117')).toBe('+14045550117');
  });
});

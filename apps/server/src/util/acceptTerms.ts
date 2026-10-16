import { z } from 'zod';

/** A client's acceptance of the privacy policy and the 18+ requirement. */
export const acceptTermsSchema = z.object({
  version: z.number().int().positive(),
  age_confirmed: z.literal(true),
});

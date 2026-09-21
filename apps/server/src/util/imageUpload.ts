import { z } from 'zod';

// One definition of "an acceptable uploaded image", shared by every route that stores
// one (PUT /me/avatar, PUT /groups/:id/photo). A second copy of the magic-byte table
// would drift, and the table is the only thing standing between a client-declared
// mime type and the bytes actually stored.

const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — keep in sync with the boundary tests in api.test.ts

// Magic bytes for accepted image types
const MAGIC_BYTES: Array<{ mime: string; check: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', check: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png',  check: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/webp', check: b => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { mime: 'image/gif',  check: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
];

export const imageUploadSchema = z.object({
  data: z.string().min(1),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
});

export type ImageUpload = z.infer<typeof imageUploadSchema>;

/**
 * Decodes and vets an upload. Callers map the two failures to their own error codes
 * (`avatar_too_large`, `photo_too_large`), which clients already key on.
 */
export function decodeImageUpload(
  upload: ImageUpload,
): { ok: true; buf: Buffer } | { ok: false; reason: 'too_large' | 'invalid_image' } {
  const buf = Buffer.from(upload.data, 'base64');
  if (buf.length > IMAGE_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const magic = MAGIC_BYTES.find(m => m.mime === upload.mime_type);
  if (!magic || buf.length < 12 || !magic.check(buf)) return { ok: false, reason: 'invalid_image' };
  return { ok: true, buf };
}

import { BadRequestException } from '@nestjs/common';

type Reference = { key?: string; objectKey?: string; fileUrl?: string };
/** A guessed object key must never become readable by attaching it to one's own record. */
export function validateAttachmentReferences(items: Reference[], existing: Reference[], ownerId: string | undefined, prefix: string) {
  const keyOf = (item: Reference): string => {
    let urlKey = '';
    if (item.fileUrl) {
      const match = /^\/api\/uploads\/preview\/([^/]+)$/.exec(item.fileUrl);
      if (!match) throw new BadRequestException('error.upload.invalid_reference');
      try { urlKey = decodeURIComponent(match[1]); } catch { throw new BadRequestException('error.upload.invalid_reference'); }
    }
    const key = item.key ?? item.objectKey ?? urlKey;
    if ((urlKey && urlKey !== key) || (item.key && item.objectKey && item.key !== item.objectKey)) throw new BadRequestException('error.upload.invalid_reference');
    return key;
  };
  const retained = new Set(existing.map(keyOf));
  for (const item of items) {
    const key = keyOf(item);
    if (!key && !item.fileUrl) continue; // Text-only certification evidence.
    if (!key.startsWith(`${prefix}/`) || key.includes('..') || key.split('/').length !== 3
      || (!retained.has(key) && (!ownerId || key.split('/')[1] !== ownerId))) {
      throw new BadRequestException('error.upload.invalid_reference');
    }
  }
}

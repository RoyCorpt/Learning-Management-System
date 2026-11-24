import path from 'node:path';
import type { Response } from 'express';
import { z } from 'zod';

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
]);

export const INLINE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  dataBase64: z.string().min(1).max(6_000_000),
}).strict();

export type AttachmentInput = z.infer<typeof attachmentSchema>;

export type ParsedAttachment = {
  name: string;
  mime: string;
  size: number;
  data: string;
};

type FailFactory = (status: number, code: string, message: string) => Error;

export function validateSafeUrl(
  rawUrl: string | null | undefined,
  makeError: FailFactory,
  invalidMessage = 'Tautan harus menggunakan protokol http atau https.',
): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw makeError(400, 'INVALID_URL', invalidMessage);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw makeError(400, 'INVALID_URL', invalidMessage);
  }
  return parsed.toString();
}

export function parseAttachment(
  att: AttachmentInput | null | undefined,
  makeError: FailFactory,
): ParsedAttachment | null {
  if (!att) return null;
  const normalizedMime = att.mimeType.toLowerCase().split(';')[0]!.trim();
  const safeName =
    path.basename(att.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255) || 'lampiran';
  const effectiveMime =
    normalizedMime === '' && safeName.endsWith('.md') ? 'text/markdown' : normalizedMime;
  if (!ALLOWED_MIME_TYPES.has(effectiveMime)) {
    throw makeError(
      400,
      'UNSUPPORTED_FILE_TYPE',
      'Jenis berkas tidak didukung. Gunakan PDF, TXT, MD, CSV, PNG, JPG, WEBP, DOCX, atau ZIP.',
    );
  }
  const cleanBase64 = att.dataBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const decoded = Buffer.from(cleanBase64, 'base64');
  if (decoded.byteLength === 0) {
    throw makeError(400, 'EMPTY_FILE', 'Berkas tidak boleh kosong.');
  }
  if (decoded.byteLength > MAX_ATTACHMENT_BYTES) {
    throw makeError(400, 'FILE_TOO_LARGE', 'Ukuran berkas melebihi batas maksimal 4 MB.');
  }
  return {
    name: safeName,
    mime: effectiveMime,
    size: decoded.byteLength,
    data: decoded.toString('base64'),
  };
}

export function sendAttachmentBuffer(
  res: Response,
  record: {
    attachmentData: string;
    attachmentName: string;
    attachmentMime: string | null;
  },
  inlineRequested = false,
) {
  const mime = record.attachmentMime || 'application/octet-stream';
  const safeInline = inlineRequested && INLINE_IMAGE_MIME_TYPES.has(mime);
  const dispositionType = safeInline ? 'inline' : 'attachment';
  const buffer = Buffer.from(record.attachmentData, 'base64');

  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${dispositionType}; filename="${record.attachmentName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(buffer);
}

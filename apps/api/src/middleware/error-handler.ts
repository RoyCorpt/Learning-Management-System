import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { RosterCsvError } from '../roster.js';

export function getPgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === 'string') return nested;
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined;
  const pgCode = getPgErrorCode(error);
  const known = error instanceof ZodError || error instanceof RosterCsvError || pgCode === '23505' || pgCode === '40001';
  console.error(JSON.stringify({ level: 'error', event: 'unhandled_error', requestId, category: known ? 'invalid_request' : 'internal' }));
  if (error instanceof ZodError) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Data permintaan tidak valid.', requestId } });
  if (error instanceof RosterCsvError) return res.status(error.code === 'ROSTER_CONFLICT' ? 409 : 400).json({ error: { code: error.code, message: error.message, ...(error.row ? { row: error.row } : {}), requestId } });
  if (pgCode === '23505') return res.status(409).json({ error: { code: 'CONFLICT', message: 'Data bertentangan dengan data yang sudah ada.', requestId } });
  if (pgCode === '40001') return res.status(409).json({ error: { code: 'CONCURRENT_UPDATE', message: 'Data akun berubah bersamaan. Periksa kembali lalu coba ulangi.', requestId } });
  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Terjadi kesalahan pada server.', requestId },
  });
};

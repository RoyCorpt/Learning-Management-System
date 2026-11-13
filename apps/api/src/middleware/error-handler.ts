import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { RosterCsvError } from '../roster.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined;
  const known = error instanceof ZodError || error instanceof RosterCsvError || (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code));
  console.error(JSON.stringify({ level: 'error', event: 'unhandled_error', requestId, category: known ? 'invalid_request' : 'internal' }));
  if (error instanceof ZodError) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Data permintaan tidak valid.', requestId } });
  if (error instanceof RosterCsvError) return res.status(error.code === 'ROSTER_CONFLICT' ? 409 : 400).json({ error: { code: error.code, message: error.message, ...(error.row ? { row: error.row } : {}), requestId } });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'Data bertentangan dengan data yang sudah ada.', requestId } });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return res.status(409).json({ error: { code: 'CONCURRENT_UPDATE', message: 'Data akun berubah bersamaan. Periksa kembali lalu coba ulangi.', requestId } });
  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Terjadi kesalahan pada server.', requestId },
  });
};

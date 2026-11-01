import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined;
  console.error(JSON.stringify({ level: 'error', event: 'unhandled_error', requestId, message: error instanceof Error ? error.message : 'Unknown error' }));
  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Terjadi kesalahan pada server.', requestId },
  });
};

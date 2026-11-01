import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const startedAt = Date.now();
  res.on('finish', () => {
    console.info(JSON.stringify({
      level: 'info', event: 'http_request', requestId,
      method: req.method, path: req.path, statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  next();
}

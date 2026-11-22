import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { sql } from 'drizzle-orm';
import { db } from '../../../src/db/index.js';
import {
  buildAllowedOrigins,
  env,
  parseExactOriginUrl,
  resolveTrustProxySetting,
  type AppEnv,
} from './config/env.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './auth.js';
import { classesRouter } from './classes.js';
import { dashboardRouter, studentRouter, userProfileRouter } from './dashboard.js';
import { notificationsRouter } from './notifications-service.js';
import { quizAttemptRouter } from './quizzes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = [
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(process.cwd(), 'apps/web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
].find((dir) => fs.existsSync(dir));

const rootPublicDir = [
  path.resolve(__dirname, '../../../public'),
  path.resolve(__dirname, '../../../../../public'),
  path.resolve(process.cwd(), 'public'),
  path.resolve(process.cwd(), '../../public'),
].find((dir) => fs.existsSync(path.join(dir, 'assets')));

export type DevFrontend = {
  middlewares: express.RequestHandler;
  transformIndexHtml: (url: string, html: string) => Promise<string>;
  indexPath: string;
};

export function isOriginAllowed(requestOrigin: string, allowedOrigins: ReadonlySet<string>): boolean {
  const exact = parseExactOriginUrl(requestOrigin);
  if (!exact) return false;
  return allowedOrigins.has(exact);
}

export function isSameRequestOrigin(req: express.Request, requestOrigin: string): boolean {
  const exact = parseExactOriginUrl(requestOrigin);
  if (!exact) return false;
  const host = req.get('host');
  if (!host) return false;
  const expected = `${req.protocol}://${host}`;
  return exact === expected;
}

export function createApp(devFrontend?: DevFrontend, runtimeEnv: AppEnv = env) {
  const app = express();
  const allowedOrigins = buildAllowedOrigins(runtimeEnv);

  app.disable('x-powered-by');
  app.set('trust proxy', resolveTrustProxySetting(runtimeEnv.TRUST_PROXY));
  app.use(requestContext);
  app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use(cors({
    origin(requestOrigin, callback) {
      if (!requestOrigin) return callback(null, false);
      return callback(null, isOriginAllowed(requestOrigin, allowedOrigins));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
    optionsSuccessStatus: 204,
  }));
  app.use(['/auth', '/api'], (req, res, next) => {
    const requestOrigin = req.get('origin');
    if (!requestOrigin) return next();
    if (isOriginAllowed(requestOrigin, allowedOrigins) || isSameRequestOrigin(req, requestOrigin)) {
      return next();
    }
    return res.status(403).json({
      error: {
        code: 'CORS_ORIGIN_DENIED',
        message: 'Origin permintaan tidak diizinkan.',
        requestId: res.locals.requestId,
      },
    });
  });
  app.use(express.json({ limit: '6mb' }));
  app.use(cookieParser());
  app.use('/auth', createAuthRouter(runtimeEnv));
  app.use('/api/classes', classesRouter);
  app.use('/api/quizzes', quizAttemptRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/students', studentRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/users', userProfileRouter);

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'lms-ptik-api' }));
  app.get('/ready', async (_req, res, next) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.status(200).json({ status: 'ready', checks: { database: 'ok' } });
    } catch (error) {
      next(error);
    }
  });

  app.use(['/api', '/auth'], (_req, res) => res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.', requestId: res.locals.requestId },
  }));

  if (rootPublicDir) {
    app.use(express.static(rootPublicDir, { maxAge: '1h' }));
  }

  if (devFrontend) {
    app.use(devFrontend.middlewares);
    app.get('*', async (req, res, next) => {
      if (req.method !== 'GET') return next();
      try {
        const template = await fs.promises.readFile(devFrontend.indexPath, 'utf8');
        const html = await devFrontend.transformIndexHtml(req.originalUrl, template);
        res.status(200)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .setHeader('Cache-Control', 'no-store')
          .end(html);
      } catch (error) {
        next(error);
      }
    });
  } else if (webDistDir) {
    app.use(express.static(webDistDir));
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(webDistDir, 'index.html'));
    });
  }

  app.use((_req, res) => res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.', requestId: res.locals.requestId },
  }));
  app.use(errorHandler);
  return app;
}

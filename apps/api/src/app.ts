import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { sql } from 'drizzle-orm';
import { db } from '../../../src/db/index.js';
import { env } from './config/env.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './auth.js';
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

export function createApp(devFrontend?: DevFrontend) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY === 'true' ? 1 : env.TRUST_PROXY === 'false' ? false : Number(env.TRUST_PROXY) || 1);
  app.use(requestContext);
  app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  }));
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
  }));
  app.use(express.json({ limit: '6mb' }));
  app.use(cookieParser());
  app.use('/auth', authRouter);
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
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
      } catch (error) {
        next(error);
      }
    });
  } else if (webDistDir) {
    app.use(express.static(webDistDir));
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(webDistDir, 'index.html'));
    });
  }

  app.use((_req, res) => res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.', requestId: res.locals.requestId },
  }));
  app.use(errorHandler);
  return app;
}

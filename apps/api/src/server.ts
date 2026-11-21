import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type express from 'express';
import { env } from './config/env.js';
import { createApp, type DevFrontend } from './app.js';
import { startFcmJobWorker, stopFcmJobWorker } from './fcm-jobs.js';
import { pool } from '../../../src/db/index.js';

type ViteServerLike = DevFrontend & {
  close: () => Promise<void>;
};

async function createDevViteServer(): Promise<ViteServerLike | undefined> {
  if (env.NODE_ENV === 'production') return undefined;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDir = [
    path.resolve(__dirname, '../../web'),
    path.resolve(process.cwd(), 'apps/web'),
    path.resolve(process.cwd(), '../web'),
  ].find((dir) =>
    fs.existsSync(path.join(dir, 'index.html')) &&
    fs.existsSync(path.join(dir, 'node_modules/vite/dist/node/index.js')),
  );

  if (!webDir) return undefined;

  const viteEntry = path.join(webDir, 'node_modules/vite/dist/node/index.js');
  const repoRoot = path.resolve(webDir, '../..');
  const { createServer } = (await import(pathToFileURL(viteEntry).href)) as {
    createServer: (config: Record<string, unknown>) => Promise<{
      middlewares: express.RequestHandler;
      transformIndexHtml: (url: string, html: string) => Promise<string>;
      close: () => Promise<void>;
    }>;
  };

  const vite = await createServer({
    root: webDir,
    configFile: path.join(webDir, 'vite.config.ts'),
    server: {
      middlewareMode: true,
      hmr: false,
      fs: {
        allow: [repoRoot],
      },
    },
    appType: 'custom',
  });

  return {
    middlewares: vite.middlewares,
    transformIndexHtml: (url, html) => vite.transformIndexHtml(url, html),
    indexPath: path.join(webDir, 'index.html'),
    close: () => vite.close(),
  };
}

async function start() {
  let viteServer: ViteServerLike | undefined;
  try {
    viteServer = await createDevViteServer();
  } catch (error) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'vite_dev_middleware_unavailable',
      message: error instanceof Error ? error.message : 'Unknown Vite startup error',
    }));
  }

  const app = createApp(viteServer);
  const port = Number(process.env.PORT ?? env.API_PORT ?? 3000);
  const server = app.listen(port, '0.0.0.0', () => {
    startFcmJobWorker();
    console.info(JSON.stringify({
      level: 'info',
      event: 'server_started',
      port,
      host: '0.0.0.0',
      environment: env.NODE_ENV,
      viteMiddleware: Boolean(viteServer),
    }));
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'server_error',
      code: error.code,
      message: error.message,
    }));
    process.exit(1);
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(JSON.stringify({ level: 'info', event: 'server_shutdown', signal }));
    setTimeout(() => process.exit(1), 5_000).unref();
    try {
      stopFcmJobWorker();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      if (viteServer) {
        await viteServer.close().catch(() => undefined);
      }
      await pool.end().catch(() => undefined);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void start();


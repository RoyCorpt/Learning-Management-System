import 'dotenv/config';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type express from 'express';
import { env } from './config/env.js';
import { createApp, type DevFrontend } from './app.js';
import { isPasswordResetEmailDeliveryConfigured } from './lib/mailer.js';
import { pool } from '../../../src/db/index.js';

type ViteServerLike = DevFrontend & {
  close: () => Promise<void>;
};

function resolveViteNodeEntry(webDir: string): string {
  const candidates = [
    () => createRequire(path.join(webDir, 'package.json')).resolve('vite/package.json'),
    () => createRequire(import.meta.url).resolve('vite/package.json'),
  ];

  for (const resolvePkg of candidates) {
    try {
      const vitePkgDir = path.dirname(resolvePkg());
      const entry = path.join(vitePkgDir, 'dist/node/index.js');
      if (fs.existsSync(entry)) return entry;
    } catch {
      // Try next resolution root
    }
  }

  throw new Error(
    'Paket "vite" tidak ditemukan di workspace. Jalankan "npm install" di root repositori terlebih dahulu.',
  );
}

function hasProductionDist(): boolean {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDistDirs = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];
  return webDistDirs.some((dir) => fs.existsSync(path.join(dir, 'index.html')));
}

async function createDevViteServer(): Promise<ViteServerLike | undefined> {
  if (env.NODE_ENV === 'production') return undefined;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDir = [
    path.resolve(__dirname, '../../web'),
    path.resolve(process.cwd(), 'apps/web'),
    path.resolve(process.cwd(), '../web'),
  ].find((dir) => fs.existsSync(path.join(dir, 'index.html')));

  if (!webDir) {
    throw new Error('Direktori frontend apps/web (index.html) tidak ditemukan.');
  }

  const viteEntry = resolveViteNodeEntry(webDir);
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

function parseValidPort(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function listenAsync(app: express.Express, port: number): Promise<import('node:http').Server> {
  return new Promise((resolve, reject) => {
    const srv = app.listen(port, '0.0.0.0', () => {
      resolve(srv);
    });
    srv.once('error', (err) => {
      reject(err);
    });
  });
}

async function start() {
  let viteServer: ViteServerLike | undefined;
  try {
    viteServer = await createDevViteServer();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'frontend_startup_failed',
        message: error instanceof Error ? error.message : 'Unknown Vite startup error',
      }),
    );
    process.exit(1);
  }

  if (env.NODE_ENV === 'production' && !hasProductionDist()) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'frontend_dist_missing',
        message: 'Bundel produksi apps/web/dist/index.html tidak ditemukan. Jalankan "npm run build" terlebih dahulu.',
      }),
    );
    process.exit(1);
  }

  if (env.NODE_ENV === 'production' && !isPasswordResetEmailDeliveryConfigured(env)) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'password_reset_smtp_unconfigured',
        message: 'SMTP belum dikonfigurasi; endpoint Lupa Kata Sandi mengembalikan 503 hingga SMTP_* diisi.',
      }),
    );
  }

  const app = createApp(viteServer);
  const defaultAppPort = parseValidPort(process.env.DEFAULT_APP_PORT, env.API_PORT || 3000);
  const primaryPort = parseValidPort(process.env.PORT, defaultAppPort);
  const servers: import('node:http').Server[] = [];

  try {
    const primaryServer = await listenAsync(app, primaryPort);
    servers.push(primaryServer);
    console.info(JSON.stringify({
      level: 'info',
      event: 'server_started',
      port: primaryPort,
      host: '0.0.0.0',
      environment: env.NODE_ENV,
      viteMiddleware: Boolean(viteServer),
    }));
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EADDRINUSE' && primaryPort !== defaultAppPort) {
      const fallbackServer = await listenAsync(app, defaultAppPort);
      servers.push(fallbackServer);
      console.info(JSON.stringify({
        level: 'info',
        event: 'server_started',
        port: defaultAppPort,
        host: '0.0.0.0',
        environment: env.NODE_ENV,
        viteMiddleware: Boolean(viteServer),
        fallbackFromPort: primaryPort,
      }));
    } else {
      throw error;
    }
  }

  // In production, if Cloud Run injects PORT (e.g. 8080) while health probes target 3000 (or vice versa),
  // also bind the fallback app port when available so probes succeed regardless of probe port config.
  if (env.NODE_ENV === 'production' && !servers.some((s) => {
    const addr = s.address();
    return addr && typeof addr !== 'string' && addr.port === defaultAppPort;
  })) {
    try {
      const auxServer = await listenAsync(app, defaultAppPort);
      servers.push(auxServer);
      console.info(JSON.stringify({
        level: 'info',
        event: 'server_aux_port_started',
        port: defaultAppPort,
        host: '0.0.0.0',
      }));
    } catch {
      // Ignore if secondary port is unavailable
    }
  }

  for (const srv of servers) {
    srv.on('error', (error: NodeJS.ErrnoException) => {
      console.error(JSON.stringify({
        level: 'error',
        event: 'server_error',
        code: error.code,
        message: error.message,
      }));
      process.exit(1);
    });
  }

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(JSON.stringify({ level: 'info', event: 'server_shutdown', signal }));
    setTimeout(() => process.exit(1), 5_000).unref();
    try {
      await Promise.all(
        servers.map((srv) => {
          srv.closeAllConnections?.();
          return new Promise<void>((resolve) => {
            srv.close(() => resolve());
          });
        }),
      );
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

void start().catch((error) => {
  const err = error as NodeJS.ErrnoException;
  console.error(JSON.stringify({
    level: 'error',
    event: 'server_error',
    code: err?.code,
    message: err instanceof Error ? err.message : String(error),
  }));
  process.exit(1);
});


import 'dotenv/config';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { pool } from '../../../src/db/index.js';

const app = createApp();
const port = Number(process.env.PORT ?? env.API_PORT ?? 3000);
const server = app.listen(port, '0.0.0.0', () => {
  console.info(JSON.stringify({ level: 'info', event: 'server_started', port, host: '0.0.0.0', environment: env.NODE_ENV }));
});

async function shutdown(signal: string) {
  console.info(JSON.stringify({ level: 'info', event: 'server_shutdown', signal }));
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

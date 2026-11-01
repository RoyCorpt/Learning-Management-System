import 'dotenv/config';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const server = app.listen(env.API_PORT, () => {
  console.info(JSON.stringify({ level: 'info', event: 'server_started', port: env.API_PORT, environment: env.NODE_ENV }));
});

async function shutdown(signal: string) {
  console.info(JSON.stringify({ level: 'info', event: 'server_shutdown', signal }));
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

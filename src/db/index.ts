import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { resolveDatabaseConnection } from './config.js';
import * as schema from './schema.js';

declare global {
  // eslint-disable-next-line no-var
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const conn = resolveDatabaseConnection('runtime');
    global._postgresPool = new Pool({
      ...(conn.kind === 'url'
        ? { connectionString: conn.connectionString }
        : {
            host: conn.host,
            port: conn.port,
            user: conn.user,
            password: conn.password,
            database: conn.database,
          }),
      ssl: conn.ssl,
      max: 10,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      allowExitOnIdle: true,
    });

    global._postgresPool.on('error', (err) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'sql_pool_idle_client_error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });

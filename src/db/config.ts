import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DbSslConfig = boolean | { rejectUnauthorized: boolean };

export type ResolvedDbConnection =
  | {
      kind: 'url';
      connectionString: string;
      ssl: DbSslConfig;
    }
  | {
      kind: 'params';
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      ssl: DbSslConfig;
    };

function parseAndInjectEnv(content: string): void {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).replace(/^export\s+/, '').trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trim();
      }
    }
    process.env[key] = value;
  }
}

export function loadLocalEnvFile(): void {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  parseAndInjectEnv(content);
}

export function resolveDbSsl(databaseUrl?: string): DbSslConfig {
  const rawSsl = process.env.DB_SSL?.trim().toLowerCase();
  const rejectUnauthorizedEnv = process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();

  let sslMode: string | undefined;
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      sslMode = parsed.searchParams.get('sslmode')?.trim().toLowerCase();
    } catch {
      // Ignore URL parsing errors here; resolveDatabaseConnection validates the URL.
    }
  }

  if (rawSsl === 'false' || rawSsl === 'disable' || rawSsl === '0' || sslMode === 'disable') {
    return false;
  }

  if (rawSsl === 'no-verify' || rawSsl === 'allow' || sslMode === 'no-verify') {
    return { rejectUnauthorized: false };
  }

  if (
    rawSsl === 'true' ||
    rawSsl === '1' ||
    rawSsl === 'require' ||
    rawSsl === 'verify-ca' ||
    rawSsl === 'verify-full'
  ) {
    return { rejectUnauthorized: rejectUnauthorizedEnv !== 'false' };
  }

  if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
    return { rejectUnauthorized: rejectUnauthorizedEnv !== 'false' };
  }

  if (sslMode === 'require' || sslMode === 'prefer') {
    return { rejectUnauthorized: rejectUnauthorizedEnv === 'true' };
  }

  return false;
}

export function resolveDatabaseConnection(mode: 'runtime' | 'admin'): ResolvedDbConnection {
  const host = process.env.SQL_HOST?.trim();
  const database = process.env.SQL_DB_NAME?.trim();
  const user =
    mode === 'admin'
      ? (process.env.SQL_ADMIN_USER?.trim() || process.env.SQL_USER?.trim())
      : process.env.SQL_USER?.trim();
  const password =
    mode === 'admin'
      ? (process.env.SQL_ADMIN_PASSWORD ?? process.env.SQL_PASSWORD)
      : process.env.SQL_PASSWORD;

  if (host && database && user && password !== undefined && password !== '') {
    const rawPort = process.env.SQL_PORT?.trim();
    const port = rawPort ? Number(rawPort) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SQL_PORT must be a valid TCP port number (1-65535).');
    }

    return {
      kind: 'params',
      host,
      port,
      user,
      password,
      database,
      ssl: resolveDbSsl(),
    };
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    let parsed: URL;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URI.');
    }
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new Error('DATABASE_URL must use postgres:// or postgresql:// protocol.');
    }
    return {
      kind: 'url',
      connectionString: databaseUrl,
      ssl: resolveDbSsl(databaseUrl),
    };
  }

  if (!host) {
    throw new Error('Set SQL_HOST (with SQL_DB_NAME/SQL_USER/SQL_PASSWORD) or DATABASE_URL in environment variables.');
  }
  if (!database) {
    throw new Error('Set SQL_DB_NAME or DATABASE_URL in environment variables.');
  }
  if (!user) {
    throw new Error(
      mode === 'admin'
        ? 'Set SQL_ADMIN_USER, SQL_USER, or DATABASE_URL in environment variables.'
        : 'Set SQL_USER or DATABASE_URL in environment variables.',
    );
  }
  throw new Error(
    mode === 'admin'
      ? 'Set SQL_ADMIN_PASSWORD, SQL_PASSWORD, or DATABASE_URL in environment variables.'
      : 'Set SQL_PASSWORD or DATABASE_URL in environment variables.',
  );
}

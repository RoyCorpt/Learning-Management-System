import { defineConfig } from 'drizzle-kit';
import { loadLocalEnvFile, resolveDatabaseConnection } from './config.js';

loadLocalEnvFile();

const conn = resolveDatabaseConnection('admin');
if (conn.kind === 'url') {
  console.log('Using DATABASE_URL to connect to database.');
} else {
  console.log(`Using user: ${conn.user} to connect to database.`);
}

export default defineConfig({
  schema: ['./src/db/schema.ts', './src/db/legacy-fcm-schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials:
    conn.kind === 'url'
      ? {
          url: conn.connectionString,
          ssl: conn.ssl,
        }
      : {
          host: conn.host,
          port: conn.port,
          user: conn.user,
          password: conn.password,
          database: conn.database,
          ssl: conn.ssl,
        },
  verbose: true,
});

import 'dotenv/config';
import { Algorithm, hash as argon2Hash } from '@node-rs/argon2';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, pool } from '../../../src/db/index.js';
import { auditEvents, users } from '../../../src/db/schema.js';

const input = z.object({
  BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(150),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(16).max(200),
}).safeParse(process.env);

try {
  if (!input.success) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and a 16+ character BOOTSTRAP_ADMIN_PASSWORD in the environment.');
  const email = input.data.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await argon2Hash(input.data.BOOTSTRAP_ADMIN_PASSWORD, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const existing = await tx.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'ADMIN'));
    if ((existing[0]?.count ?? 0) > 0) {
      throw new Error('Admin bootstrap is allowed only before the first Admin account exists.');
    }
    const inserted = await tx.insert(users).values({
      email,
      fullName: input.data.BOOTSTRAP_ADMIN_NAME,
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash,
    }).returning({ id: users.id });
    await tx.insert(auditEvents).values({
      action: 'ADMIN_BOOTSTRAPPED',
      subjectId: inserted[0]!.id,
    });
  });
  console.info(JSON.stringify({ event: 'admin_bootstrap_succeeded' }));
} catch {
  console.error(JSON.stringify({ event: 'admin_bootstrap_failed', category: input.success ? 'operation_failed' : 'invalid_configuration' }));
  process.exitCode = 1;
} finally {
  await pool.end();
}

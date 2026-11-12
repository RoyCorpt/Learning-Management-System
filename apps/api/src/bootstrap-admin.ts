import 'dotenv/config';
import argon2 from 'argon2';
import { AccountStatus, PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const input = z.object({ BOOTSTRAP_ADMIN_EMAIL: z.string().email(), BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(150), BOOTSTRAP_ADMIN_PASSWORD: z.string().min(16).max(200) }).safeParse(process.env);
try {
  if (!input.success) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and a 16+ character BOOTSTRAP_ADMIN_PASSWORD in the environment.');
  const email = input.data.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  await prisma.$transaction(async (tx) => {
    const admins = await tx.user.count({ where: { role: Role.ADMIN } });
    if (admins > 0) throw new Error('Admin bootstrap is allowed only before the first Admin account exists.');
    const user = await tx.user.create({ data: { email, fullName: input.data.BOOTSTRAP_ADMIN_NAME, role: Role.ADMIN, status: AccountStatus.ACTIVE, passwordHash: await argon2.hash(input.data.BOOTSTRAP_ADMIN_PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }) }, select: { id: true } });
    await tx.auditEvent.create({ data: { action: 'ADMIN_BOOTSTRAPPED', subjectId: user.id } });
  }, { isolationLevel: 'Serializable' });
  console.info(JSON.stringify({ event: 'admin_bootstrap_succeeded' }));
} catch (error) {
  console.error(JSON.stringify({ event: 'admin_bootstrap_failed', category: input.success ? 'operation_failed' : 'invalid_configuration' }));
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }

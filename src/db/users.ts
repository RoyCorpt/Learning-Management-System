import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from './index.js';
import { users } from './schema.js';

export async function getOrCreateUser(uid: string, email: string, fullName?: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingByEmail[0]) {
      const updated = await db
        .update(users)
        .set({
          uid,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail[0].id))
        .returning();
      return updated[0]!;
    }

    const existingCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const isFirstUser = (existingCountResult[0]?.count ?? 0) === 0;

    const displayName = (fullName?.trim() || normalizedEmail.split('@')[0] || 'Pengguna LMS').slice(0, 150);
    const placeholderHash = `!firebase-oauth:${randomBytes(24).toString('hex')}`;

    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        fullName: displayName,
        passwordHash: placeholderHash,
        role: isFirstUser ? 'ADMIN' : 'MAHASISWA',
        status: 'ACTIVE',
        mustChangePassword: false,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0]!;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

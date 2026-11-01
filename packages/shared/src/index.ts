export const USER_ROLES = ['ADMIN', 'DOSEN', 'MAHASISWA'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export type ApiError = { error: { code: string; message: string; requestId?: string } };

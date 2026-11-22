import nodemailer from 'nodemailer';
import { env, type AppEnv } from '../config/env.js';

export type PasswordResetEmailPayload = {
  to: string;
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export type PasswordResetMailHook = (payload: PasswordResetEmailPayload) => Promise<void> | void;

export class MailDeliveryError extends Error {
  constructor(message = 'Layanan pengiriman email sedang tidak tersedia. Silakan coba lagi nanti.') {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

let mailHook: PasswordResetMailHook | null = null;

export function setPasswordResetMailHook(hook: PasswordResetMailHook | null) {
  mailHook = hook;
}

export function buildPasswordResetUrl(rawToken: string, baseOrigin = env.WEB_ORIGIN) {
  const baseUrl = baseOrigin.replace(/\/+$/, '');
  return `${baseUrl}/#resetToken=${encodeURIComponent(rawToken)}`;
}

export function isPasswordResetEmailDeliveryConfigured(
  cfg: Pick<AppEnv, 'NODE_ENV' | 'SMTP_HOST' | 'SMTP_USER' | 'SMTP_PASS' | 'PASSWORD_RESET_DEV_PREVIEW'> = env,
): boolean {
  if (mailHook) return true;
  if (cfg.NODE_ENV === 'production') {
    return Boolean(cfg.SMTP_HOST && cfg.SMTP_USER && cfg.SMTP_PASS);
  }
  if (cfg.SMTP_HOST) {
    return Boolean(!cfg.SMTP_USER || cfg.SMTP_PASS);
  }
  return cfg.NODE_ENV === 'development' && cfg.PASSWORD_RESET_DEV_PREVIEW;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createSmtpTransport(
  cfg: Pick<AppEnv, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS'>,
) {
  return nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_SECURE,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    ...(cfg.SMTP_USER && cfg.SMTP_PASS
      ? { auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } }
      : {}),
  });
}

export async function verifySmtpConnection(
  cfg: Pick<AppEnv, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS'> = env,
): Promise<boolean> {
  if (!cfg.SMTP_HOST) return false;
  const transporter = createSmtpTransport(cfg);
  await transporter.verify();
  return true;
}

export async function sendPasswordResetEmail(
  payload: PasswordResetEmailPayload,
  cfg: Pick<
    AppEnv,
    'NODE_ENV' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS' | 'SMTP_FROM' | 'PASSWORD_RESET_DEV_PREVIEW'
  > = env,
): Promise<void> {
  if (mailHook) {
    await mailHook(payload);
    return;
  }

  const subject = 'Atur Ulang Kata Sandi Akun SINTAKS';
  const text = [
    `Halo ${payload.fullName},`,
    '',
    'Kami menerima permintaan untuk mengatur ulang kata sandi akun SINTAKS Anda.',
    'Buka tautan berikut untuk membuat kata sandi baru:',
    payload.resetUrl,
    '',
    `Tautan ini hanya berlaku satu kali selama ${payload.expiresInMinutes} menit.`,
    'Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini dan kata sandi Anda tidak akan berubah.',
  ].join('\n');

  const safeName = escapeHtml(payload.fullName);
  const safeUrl = escapeHtml(payload.resetUrl);
  const html = `
<!doctype html>
<html lang="id">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #19211d; line-height: 1.6; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 12px; color: #1d5d41;">Atur Ulang Kata Sandi SINTAKS</h2>
    <p>Halo <strong>${safeName}</strong>,</p>
    <p>Kami menerima permintaan untuk mengatur ulang kata sandi akun SINTAKS Anda. Klik tombol di bawah ini untuk membuat kata sandi baru:</p>
    <p style="margin: 24px 0;">
      <a href="${safeUrl}" style="display: inline-block; background: #277954; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 20px; border-radius: 6px;">Atur Ulang Kata Sandi</a>
    </p>
    <p style="font-size: 13px; color: #4d5c54;">Atau salin dan buka tautan berikut di peramban Anda:<br /><a href="${safeUrl}" style="color: #1d5d41; word-break: break-all;">${safeUrl}</a></p>
    <p style="font-size: 13px; color: #4d5c54;">Tautan ini hanya berlaku satu kali selama ${payload.expiresInMinutes} menit. Jika Anda tidak merasa meminta pengaturan ulang kata sandi, abaikan email ini.</p>
  </body>
</html>`.trim();

  if (cfg.SMTP_HOST) {
    const transporter = createSmtpTransport(cfg);
    try {
      await transporter.sendMail({
        from: cfg.SMTP_FROM,
        to: payload.to,
        subject,
        text,
        html,
      });
      return;
    } catch (error) {
      const errCode =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'SMTP_SEND_ERROR';
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'password_reset_smtp_delivery_failed',
          errorCode: errCode,
        }),
      );
      throw new MailDeliveryError();
    }
  }

  if (cfg.NODE_ENV === 'development' && cfg.PASSWORD_RESET_DEV_PREVIEW) {
    console.info(
      `[SINTAKS DEV MAIL PREVIEW] Subject: ${subject} | Reset URL (${payload.expiresInMinutes}m): ${payload.resetUrl}`,
    );
    return;
  }

  throw new MailDeliveryError('Layanan pengiriman email belum dikonfigurasi.');
}

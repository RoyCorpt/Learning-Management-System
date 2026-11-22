import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export type PasswordResetEmailPayload = {
  to: string;
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export type PasswordResetMailHook = (payload: PasswordResetEmailPayload) => Promise<void> | void;

let mailHook: PasswordResetMailHook | null = null;

export function setPasswordResetMailHook(hook: PasswordResetMailHook | null) {
  mailHook = hook;
}

export function buildPasswordResetUrl(rawToken: string) {
  const baseUrl = env.WEB_ORIGIN.replace(/\/+$/, '');
  return `${baseUrl}/?resetToken=${encodeURIComponent(rawToken)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
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

  if (env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASS
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
        : {}),
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      subject,
      text,
      html,
    });
    return;
  }

  if (env.NODE_ENV === 'development') {
    console.info(
      `[SINTAKS DEV MAIL] To: ${payload.to} | Subject: ${subject} | Reset URL (${payload.expiresInMinutes}m): ${payload.resetUrl}`,
    );
    return;
  }

  console.warn(
    JSON.stringify({
      level: 'warn',
      event: 'password_reset_smtp_unconfigured',
      message: 'SMTP_HOST belum dikonfigurasi; email reset kata sandi tidak dapat dikirim melalui SMTP.',
    }),
  );
}

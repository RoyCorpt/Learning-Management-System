import { env, type AppEnv } from '../config/env.js';

export const BREVO_SEND_EMAIL_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export type PasswordResetEmailPayload = {
  to: string;
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export type TransactionalEmailInput = {
  to: { email: string; name?: string };
  subject: string;
  textContent: string;
  htmlContent: string;
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
  if (!baseOrigin) {
    throw new MailDeliveryError('WEB_ORIGIN belum dikonfigurasi untuk tautan atur ulang kata sandi.');
  }
  const baseUrl = baseOrigin.replace(/\/+$/, '');
  return `${baseUrl}/#resetToken=${encodeURIComponent(rawToken)}`;
}

export function isPasswordResetEmailDeliveryConfigured(
  cfg: Pick<AppEnv, 'NODE_ENV' | 'BREVO_API_KEY' | 'BREVO_SENDER_EMAIL' | 'PASSWORD_RESET_DEV_PREVIEW'> = env,
): boolean {
  if (mailHook) return true;
  if (cfg.BREVO_API_KEY && cfg.BREVO_SENDER_EMAIL) return true;
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

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
  cfg: Pick<AppEnv, 'BREVO_API_KEY' | 'BREVO_SENDER_EMAIL' | 'BREVO_SENDER_NAME'> = env,
): Promise<{ messageId?: string }> {
  if (!cfg.BREVO_API_KEY || !cfg.BREVO_SENDER_EMAIL) {
    throw new MailDeliveryError('Layanan pengiriman email belum dikonfigurasi.');
  }

  let response: Response;
  try {
    response = await fetch(BREVO_SEND_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': cfg.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: cfg.BREVO_SENDER_NAME || 'SINTAKS',
          email: cfg.BREVO_SENDER_EMAIL,
        },
        to: [
          {
            email: input.to.email,
            ...(input.to.name ? { name: input.to.name } : {}),
          },
        ],
        subject: input.subject,
        htmlContent: input.htmlContent,
        textContent: input.textContent,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const errName = error instanceof Error ? error.name : 'FETCH_ERROR';
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'brevo_email_request_failed',
        errorCode: errName,
      }),
    );
    throw new MailDeliveryError();
  }

  if (!response.ok) {
    let providerCode: string | undefined;
    let providerMessage: string | undefined;
    try {
      const errBody = (await response.json()) as { code?: unknown; message?: unknown };
      if (typeof errBody?.code === 'string') {
        providerCode = errBody.code;
      }
      if (typeof errBody?.message === 'string' && errBody.message.trim().length > 0) {
        providerMessage = errBody.message
          .replace(/(?:xkeysib|xsmtpsib)-[a-zA-Z0-9-]+/g, '[REDACTED]')
          .trim()
          .slice(0, 200);
      }
    } catch {
      // Ignore unparseable provider error body
    }
    const keyFormatHint = cfg.BREVO_API_KEY.startsWith('xsmtpsib-')
      ? 'BREVO_API_KEY appears to be an SMTP key (xsmtpsib-); use a Brevo REST API v3 key (xkeysib-) instead.'
      : undefined;
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'brevo_email_api_rejected',
        statusCode: response.status,
        ...(providerCode ? { providerCode } : {}),
        ...(providerMessage ? { providerMessage } : {}),
        ...(keyFormatHint ? { keyFormatHint } : {}),
      }),
    );
    throw new MailDeliveryError();
  }

  try {
    const data = (await response.json()) as { messageId?: unknown };
    return typeof data?.messageId === 'string' ? { messageId: data.messageId } : {};
  } catch {
    return {};
  }
}

export async function sendPasswordResetEmail(
  payload: PasswordResetEmailPayload,
  cfg: Pick<
    AppEnv,
    'NODE_ENV' | 'BREVO_API_KEY' | 'BREVO_SENDER_EMAIL' | 'BREVO_SENDER_NAME' | 'PASSWORD_RESET_DEV_PREVIEW'
  > = env,
): Promise<void> {
  if (mailHook) {
    await mailHook(payload);
    return;
  }

  const subject = 'Atur Ulang Kata Sandi Akun SINTAKS';
  const textContent = [
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
  const htmlContent = `
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

  if (cfg.BREVO_API_KEY && cfg.BREVO_SENDER_EMAIL) {
    await sendTransactionalEmail(
      {
        to: { email: payload.to, name: payload.fullName },
        subject,
        textContent,
        htmlContent,
      },
      cfg,
    );
    return;
  }

  if (cfg.NODE_ENV === 'development' && cfg.PASSWORD_RESET_DEV_PREVIEW) {
    console.info(
      `[SINTAKS DEV MAIL PREVIEW] Subject: ${subject} | Reset URL (${payload.expiresInMinutes}m): ${payload.resetUrl}`,
    );
    return;
  }

  throw new MailDeliveryError('Layanan pengiriman email belum dikonfigurasi.');
}

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import firebaseConfig from '../../../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

const envVapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '').trim();

export async function isFcmPushSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function registerFcmDeviceToken(serverVapidKey?: string | null): Promise<string> {
  const supported = await isFcmPushSupported();
  if (!supported) {
    throw new Error('Peramban ini belum mendukung notifikasi push Firebase.');
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error('Izin notifikasi peramban ditolak.');
  }

  const vapidKey = (serverVapidKey ?? '').trim() || envVapidKey;
  if (!vapidKey) {
    throw new Error(
      'Kunci Web Push (VAPID) Firebase belum dikonfigurasi pada pengaturan lingkungan.',
    );
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/',
  });
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('Gagal memperoleh token perangkat Firebase Cloud Messaging.');
  }

  return token;
}

export async function listenForegroundFcmMessages(
  handler: (payload: MessagePayload) => void,
): Promise<() => void> {
  const supported = await isFcmPushSupported();
  if (!supported) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, handler);
}

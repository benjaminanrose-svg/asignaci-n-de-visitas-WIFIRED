// ============================================================
// WIFIRED · Notificaciones push (cliente)
// ============================================================
import { getToken } from './auth.js';

async function api(method, url, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  const tk = getToken();
  if (tk) opt.headers.Authorization = 'Bearer ' + tk;
  if (body) opt.body = JSON.stringify(body);
  let res;
  try { res = await fetch('/api' + url, opt); }
  catch (e) { throw new Error('Necesitas conexión a internet para activar las notificaciones'); }
  if (!res.ok) throw new Error('Error de servidor');
  return res.json();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Registra el service worker (para instalación y push) */
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/sw.js'); } catch (e) { /* ignore */ }
}

export function pushSupported() {
  return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}
export function notifPermission() {
  return ('Notification' in window) ? Notification.permission : 'unsupported';
}

/** Pide permiso y suscribe este dispositivo a las notificaciones */
export async function enablePush() {
  if (!pushSupported()) throw new Error('Este dispositivo/navegador no soporta notificaciones push');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('No se concedió el permiso de notificaciones');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('GET', '/push/config');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  await api('POST', '/push/subscribe', { subscription: sub });
  return true;
}

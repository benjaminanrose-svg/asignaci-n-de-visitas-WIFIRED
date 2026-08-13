// ============================================================
// WIFIRED · Envío de la orden de trabajo firmada por correo
// Railway bloquea SMTP (587/465), así que el envío usa APIs HTTP
// (puerto 443, nunca bloqueado). Proveedores soportados:
//   1) Brevo   → BREVO_API_KEY   (recomendado: permite remitente Gmail sin dominio)
//   2) Resend  → RESEND_API_KEY  (requiere dominio verificado)
//   3) Gmail SMTP → GMAIL_USER + GMAIL_APP_PASSWORD (suele fallar en Railway)
// Remitente: MAIL_FROM (o GMAIL_USER como respaldo).
// ============================================================
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LEGAL = 'Con mi firma, declaro recibir conforme el servicio técnico contratado, validando que la instalación (cableado, perforaciones y canalizado) se realizó a mi entera satisfacción. Asimismo, constato que los equipos quedan operativos, con los parámetros de navegación (velocidad y señal Wi-Fi) verificados y aceptados en mi presencia.';

function fromAddress() {
  return process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@wifired.cl';
}

function provider() {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'smtp';
  return null;
}
function mailConfigured() { return !!provider(); }

/** Orden autocontenida (firmas embebidas como data URI) */
function ordenHTML(v, company) {
  const num = (String(v.id).match(/(\d+)\s*$/) || [])[1] || '';
  const firma = (data) => data ? `<img src="${data}" style="max-width:220px;max-height:80px">` : '';
  const f = (k, val) => `<td style="padding:6px 8px;border:1px solid #ddd;font-size:12px;vertical-align:top"><div style="font-size:9px;text-transform:uppercase;color:#888;letter-spacing:.4px">${esc(k)}</div>${esc(val || '—')}</td>`;
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:700px;margin:0 auto;color:#111;padding:16px">
    <table style="width:100%;border-bottom:2px solid #111;padding-bottom:8px"><tr>
      <td><b style="font-size:16px">${esc(company.nombre)}</b><br><span style="font-size:11px;color:#555">${esc(company.direccion)}<br>${esc(company.fonos.join(' · '))} · ${esc(company.email)}</span></td>
      <td style="text-align:right;vertical-align:top"><div style="font-size:10px;color:#888">N° ORDEN</div><b style="font-size:15px">${esc(v.id)}</b></td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr>${f('Nombre del cliente', v.cliente)}${f('ID de cliente', v.rut)}</tr>
      <tr>${f('Teléfono', v.telefono)}${f('Técnico asignado', v.tecnico)}</tr>
      <tr>${f('N° de trabajo', num)}${f('Correo del cliente', v.email)}</tr>
      <tr>${f('Fecha prevista', (v.fecha || '') + ' ' + (v.bloque || ''))}${f('Estado', v.estado)}</tr>
      <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd;font-size:12px"><div style="font-size:9px;text-transform:uppercase;color:#888">Dirección cliente</div>${esc(v.direccion)}</td></tr>
      <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd;font-size:12px"><div style="font-size:9px;text-transform:uppercase;color:#888">Trabajo / descripción</div>${esc(v.tipo)}</td></tr>
      <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd;font-size:12px"><div style="font-size:9px;text-transform:uppercase;color:#888">Comentarios adicionales</div>${esc(v.detalle || '—')}</td></tr>
      <tr>${f('Trabajos autorizados por', company.autoriza)}${f('Prioridad', v.prioridad)}</tr>
    </table>
    <table style="width:100%;margin-top:26px;text-align:center"><tr>
      <td style="width:50%">${firma(v.firma_cliente)}<div style="border-top:1px solid #111;margin-top:6px;padding-top:5px;font-size:12px">Firma del cliente</div></td>
      <td style="width:50%">${firma(v.firma_tecnico)}<div style="border-top:1px solid #111;margin-top:6px;padding-top:5px;font-size:12px">Firma del técnico</div></td>
    </tr></table>
    <p style="font-size:10px;color:#555;line-height:1.5;margin-top:18px;border-top:1px solid #eee;padding-top:10px">${esc(LEGAL)}</p>
    </div></body></html>`;
}

async function sendViaBrevo(v, html, attachmentB64) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: fromAddress(), name: 'WIFIRED' },
      to: [{ email: v.email }],
      subject: `Orden de trabajo ${v.id} — WIFIRED`,
      htmlContent: html,
      attachment: [{ name: `orden_${v.id}.html`, content: attachmentB64 }],
    }),
  });
  if (res.ok) return { ok: true };
  const t = await res.text().catch(() => '');
  return { ok: false, reason: `Brevo ${res.status}: ${t.slice(0, 180)}` };
}

async function sendViaResend(v, html, attachmentB64) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `WIFIRED <${fromAddress()}>`,
      to: [v.email],
      subject: `Orden de trabajo ${v.id} — WIFIRED`,
      html,
      attachments: [{ filename: `orden_${v.id}.html`, content: attachmentB64 }],
    }),
  });
  if (res.ok) return { ok: true };
  const t = await res.text().catch(() => '');
  return { ok: false, reason: `Resend ${res.status}: ${t.slice(0, 180)}` };
}

async function sendViaSmtp(v, html) {
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 15000,
  });
  try {
    await t.sendMail({ from: `WIFIRED <${fromAddress()}>`, to: v.email, subject: `Orden de trabajo ${v.id} — WIFIRED`, html });
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'SMTP: ' + e.message }; }
}

/** Envía la orden firmada al correo del cliente. Devuelve {ok, reason?} */
async function sendOrden(v, company) {
  const p = provider();
  if (!p) return { ok: false, reason: 'Correo no configurado (define BREVO_API_KEY o RESEND_API_KEY)' };
  if (!v.email) return { ok: false, reason: 'El cliente no tiene correo registrado' };

  const html = ordenHTML(v, company);
  const attachmentB64 = Buffer.from(html, 'utf8').toString('base64');
  try {
    if (p === 'brevo') return await sendViaBrevo(v, html, attachmentB64);
    if (p === 'resend') return await sendViaResend(v, html, attachmentB64);
    return await sendViaSmtp(v, html);
  } catch (e) {
    console.error('Error al enviar correo:', e.message);
    return { ok: false, reason: 'No se pudo enviar el correo: ' + e.message };
  }
}

module.exports = { sendOrden, mailConfigured };

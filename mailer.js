// ============================================================
// WIFIRED · Envío de la orden de trabajo firmada por correo
// Genera un PDF (pdfkit) y lo adjunta. Railway bloquea SMTP, así
// que el envío usa APIs HTTP (puerto 443):
//   1) Brevo  → BREVO_API_KEY   (recomendado; permite remitente Gmail)
//   2) Resend → RESEND_API_KEY
//   3) Gmail SMTP → GMAIL_USER + GMAIL_APP_PASSWORD (respaldo)
// Remitente: MAIL_FROM (o GMAIL_USER).
// ============================================================
const PDFDocument = require('pdfkit');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LEGAL = 'Con mi firma, declaro recibir conforme el servicio técnico contratado, validando que la instalación (cableado, perforaciones y canalizado) se realizó a mi entera satisfacción. Asimismo, constato que los equipos quedan operativos, con los parámetros de navegación (velocidad y señal Wi-Fi) verificados y aceptados en mi presencia.';

function fromAddress() { return process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@wifired.cl'; }
function provider() {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'smtp';
  return null;
}
function mailConfigured() { return !!provider(); }

function dataUriToBuffer(d) {
  const m = /^data:.+?;base64,(.*)$/.exec(d || '');
  return m ? Buffer.from(m[1], 'base64') : null;
}

/** Genera la orden como PDF (A4). Devuelve Promise<Buffer> */
function ordenPDF(v, company) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M = 40, W = doc.page.width, right = W - M;
    // Encabezado empresa
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111').text(company.nombre, M, M, { width: W - M * 2 - 150 });
    doc.font('Helvetica').fontSize(9).fillColor('#555');
    doc.text(company.direccion, M, doc.y, { width: W - M * 2 - 150 });
    doc.text(company.fonos.join(' · ') + ' · ' + company.email, { width: W - M * 2 - 150 });
    // N° orden a la derecha
    doc.font('Helvetica').fontSize(8).fillColor('#888').text('N° ORDEN', right - 170, M, { width: 170, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111').text(String(v.id), right - 170, M + 11, { width: 170, align: 'right' });

    let y = Math.max(doc.y, M + 46) + 8;
    doc.moveTo(M, y).lineTo(right, y).lineWidth(1.5).strokeColor('#111').stroke();
    y += 14;

    const colGap = 20, colW = (W - M * 2 - colGap) / 2, x2 = M + colW + colGap;
    function field(x, yy, w, label, value) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#888').text((label || '').toUpperCase(), x, yy, { width: w });
      const vy = doc.y + 1;
      doc.font('Helvetica').fontSize(10).fillColor('#111').text(String(value || '—'), x, vy, { width: w });
      return doc.y + 9;
    }
    function row(l1, v1, l2, v2) {
      const y1 = field(M, y, colW, l1, v1);
      const y2 = (l2 !== undefined) ? field(x2, y, colW, l2, v2) : y1;
      y = Math.max(y1, y2);
      doc.moveTo(M, y - 4).lineTo(right, y - 4).lineWidth(0.5).strokeColor('#e2e2e2').stroke();
    }
    function full(label, value) {
      y = field(M, y, W - M * 2, label, value);
      doc.moveTo(M, y - 4).lineTo(right, y - 4).lineWidth(0.5).strokeColor('#e2e2e2').stroke();
    }
    const num = (String(v.id).match(/(\d+)\s*$/) || [])[1] || '';
    row('Nombre del cliente', v.cliente, 'ID de cliente (RUT)', v.rut);
    row('Teléfono del cliente', v.telefono, 'Correo del cliente', v.email);
    row('N° de trabajo', num, 'Técnico asignado', v.tecnico);
    row('Fecha prevista', (v.fecha || '') + ' ' + (v.bloque || ''), 'Estado', v.estado);
    full('Dirección del cliente', v.direccion);
    full('Trabajo / descripción', v.tipo);
    full('Comentarios adicionales', v.detalle);
    row('Trabajos autorizados por', company.autoriza, 'Prioridad', v.prioridad);

    // Firmas
    y += 34;
    const sigH = 70, sy = y;
    const fc = dataUriToBuffer(v.firma_cliente), ft = dataUriToBuffer(v.firma_tecnico);
    try { if (fc) doc.image(fc, M + 20, sy, { fit: [colW - 40, sigH], align: 'center' }); } catch (e) {}
    try { if (ft) doc.image(ft, x2 + 20, sy, { fit: [colW - 40, sigH], align: 'center' }); } catch (e) {}
    const ly = sy + sigH + 4;
    doc.moveTo(M, ly).lineTo(M + colW, ly).lineWidth(1).strokeColor('#111').stroke();
    doc.moveTo(x2, ly).lineTo(x2 + colW, ly).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Firma del cliente', M, ly + 5, { width: colW, align: 'center' });
    doc.text('Firma del técnico', x2, ly + 5, { width: colW, align: 'center' });

    doc.font('Helvetica').fontSize(8).fillColor('#555').text(LEGAL, M, ly + 32, { width: W - M * 2, align: 'justify' });
    doc.end();
  });
}

function bodyHTML(v) {
  return `<div style="font-family:Arial,sans-serif;color:#111;font-size:14px">
    <p>Estimado/a ${esc(v.cliente || '')},</p>
    <p>Adjuntamos la <b>orden de trabajo ${esc(v.id)}</b> de su servicio con WIFIRED, firmada por ambas partes.</p>
    <p>Ante cualquier consulta, responda este correo o comuníquese con Soporte WIFIRED.</p>
    <p style="color:#555">Saludos,<br><b>WIFIRED</b> — Telecomunicaciones</p>
  </div>`;
}

async function sendViaBrevo(v, html, pdfB64, filename) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: fromAddress(), name: 'WIFIRED' },
      to: [{ email: v.email }],
      subject: `Orden de trabajo ${v.id} — WIFIRED`,
      htmlContent: html,
      attachment: [{ name: filename, content: pdfB64 }],
    }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, reason: `Brevo ${res.status}: ${(await res.text().catch(() => '')).slice(0, 180)}` };
}

async function sendViaResend(v, html, pdfB64, filename) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `WIFIRED <${fromAddress()}>`,
      to: [v.email],
      subject: `Orden de trabajo ${v.id} — WIFIRED`,
      html,
      attachments: [{ filename, content: pdfB64 }],
    }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, reason: `Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 180)}` };
}

async function sendViaSmtp(v, html, pdfBuffer, filename) {
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 15000,
  });
  try {
    await t.sendMail({ from: `WIFIRED <${fromAddress()}>`, to: v.email, subject: `Orden de trabajo ${v.id} — WIFIRED`, html, attachments: [{ filename, content: pdfBuffer }] });
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'SMTP: ' + e.message }; }
}

/** Envía la orden firmada (PDF) al correo del cliente. Devuelve {ok, reason?} */
async function sendOrden(v, company) {
  const p = provider();
  if (!p) return { ok: false, reason: 'Correo no configurado (define BREVO_API_KEY o RESEND_API_KEY)' };
  if (!v.email) return { ok: false, reason: 'El cliente no tiene correo registrado' };

  try {
    const pdf = await ordenPDF(v, company);
    const pdfB64 = pdf.toString('base64');
    const filename = `orden_${v.id}.pdf`;
    const html = bodyHTML(v);
    if (p === 'brevo') return await sendViaBrevo(v, html, pdfB64, filename);
    if (p === 'resend') return await sendViaResend(v, html, pdfB64, filename);
    return await sendViaSmtp(v, html, pdf, filename);
  } catch (e) {
    console.error('Error al enviar correo:', e.message);
    return { ok: false, reason: 'No se pudo enviar el correo: ' + e.message };
  }
}

module.exports = { sendOrden, mailConfigured };

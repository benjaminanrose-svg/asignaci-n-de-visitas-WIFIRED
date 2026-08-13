// ============================================================
// WIFIRED · Envío de la orden de trabajo firmada por correo
// Usa Gmail (nodemailer). Requiere variables de entorno:
//   GMAIL_USER = correo remitente (ej: soporte@wifired.cl o una cuenta Gmail)
//   GMAIL_APP_PASSWORD = contraseña de aplicación de Google (16 caracteres)
// Si no están configuradas, degrada de forma controlada.
// ============================================================
const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (transporter !== undefined) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  // Puerto 465 (SMTPS): el 587 suele estar bloqueado en Railway
  transporter = (user && pass) ? nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  }) : null;
  return transporter;
}
function mailConfigured() { return !!getTransporter(); }

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LEGAL = 'Con mi firma, declaro recibir conforme el servicio técnico contratado, validando que la instalación (cableado, perforaciones y canalizado) se realizó a mi entera satisfacción. Asimismo, constato que los equipos quedan operativos, con los parámetros de navegación (velocidad y señal Wi-Fi) verificados y aceptados en mi presencia.';

function ordenHTML(v, company, cids) {
  const num = (String(v.id).match(/(\d+)\s*$/) || [])[1] || '';
  const firma = (cid) => cid ? `<img src="cid:${cid}" style="max-width:220px;max-height:90px">` : '<span style="color:#999">—</span>';
  const f = (k, val) => `<td style="padding:6px 8px;border:1px solid #ddd;font-size:12px"><div style="font-size:9px;text-transform:uppercase;color:#888;letter-spacing:.4px">${esc(k)}</div>${esc(val || '—')}</td>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:700px;margin:0 auto;color:#111">
    <table style="width:100%;border-bottom:2px solid #111;padding-bottom:8px"><tr>
      <td><b style="font-size:16px">${esc(company.nombre)}</b><br><span style="font-size:11px;color:#555">${esc(company.direccion)}<br>${esc(company.fonos.join(' · '))} · ${esc(company.email)}</span></td>
      <td style="text-align:right;vertical-align:top"><div style="font-size:10px;color:#888">N° ORDEN</div><b style="font-size:15px">${esc(v.id)}</b></td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr>${f('Nombre del cliente', v.cliente)}${f('ID de cliente', v.rut)}</tr>
      <tr>${f('Teléfono', v.telefono)}${f('Técnico asignado', v.tecnico)}</tr>
      <tr>${f('N° de trabajo', num)}${f('Correo del cliente', v.email)}</tr>
      <tr>${f('Fecha prevista', v.fecha + ' ' + (v.bloque || ''))}${f('Estado', v.estado)}</tr>
      <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd;font-size:12px"><div style="font-size:9px;text-transform:uppercase;color:#888">Dirección cliente</div>${esc(v.direccion)}</td></tr>
      <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd;font-size:12px"><div style="font-size:9px;text-transform:uppercase;color:#888">Trabajo / descripción</div>${esc(v.tipo)}</td></tr>
      <tr><td colspan="2" style="padding:6px 8px;border:1px solid #ddd;font-size:12px"><div style="font-size:9px;text-transform:uppercase;color:#888">Comentarios adicionales</div>${esc(v.detalle || '—')}</td></tr>
      <tr>${f('Trabajos autorizados por', company.autoriza)}${f('Prioridad', v.prioridad)}</tr>
    </table>
    <table style="width:100%;margin-top:30px;text-align:center"><tr>
      <td style="width:50%">${firma(cids.fc)}<div style="border-top:1px solid #111;margin-top:6px;padding-top:5px;font-size:12px">Firma del cliente</div></td>
      <td style="width:50%">${firma(cids.ft)}<div style="border-top:1px solid #111;margin-top:6px;padding-top:5px;font-size:12px">Firma del técnico</div></td>
    </tr></table>
    <p style="font-size:10px;color:#555;line-height:1.5;margin-top:20px;border-top:1px solid #eee;padding-top:10px">${esc(LEGAL)}</p>
  </div>`;
}

/** Envía la orden firmada al correo del cliente. Devuelve {ok, reason?} */
async function sendOrden(v, company) {
  const t = getTransporter();
  if (!t) return { ok: false, reason: 'Correo no configurado en el servidor (GMAIL_USER / GMAIL_APP_PASSWORD)' };
  if (!v.email) return { ok: false, reason: 'El cliente no tiene correo registrado' };

  const attachments = [];
  const addImg = (dataUrl, cid, filename) => {
    if (!dataUrl) return null;
    const m = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
    if (!m) return null;
    attachments.push({ filename, cid, content: Buffer.from(m[2], 'base64'), contentType: m[1] });
    return cid;
  };
  const fc = addImg(v.firma_cliente, 'firmaCliente', 'firma_cliente.png');
  const ft = addImg(v.firma_tecnico, 'firmaTecnico', 'firma_tecnico.png');

  const html = ordenHTML(v, company, { fc, ft });
  try {
    await t.sendMail({
      from: `WIFIRED <${process.env.GMAIL_USER}>`,
      to: v.email,
      subject: `Orden de trabajo ${v.id} — WIFIRED`,
      text: `Estimado/a ${v.cliente}, adjuntamos la orden de trabajo ${v.id} de su servicio con WIFIRED.`,
      html,
      attachments,
    });
    return { ok: true };
  } catch (e) {
    console.error('Error al enviar correo:', e.message);
    return { ok: false, reason: 'No se pudo enviar el correo: ' + e.message };
  }
}

module.exports = { sendOrden, mailConfigured };

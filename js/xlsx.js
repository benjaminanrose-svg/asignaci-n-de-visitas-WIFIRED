// ============================================================
// WIFIRED · Informe Excel (.xlsx) en el navegador, sin dependencias.
// Hoja "Rendimiento" con tabla por técnico + 2 gráficos nativos de Excel
// (barras asignadas vs completadas y torta de distribución del trabajo)
// y hoja "Detalle" con las visitas del período.
// ============================================================
import { makeZip } from './zip.js';

const enc = new TextEncoder();
const x = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colL = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

// Estilos (índices de cellXfs)
const S = { normal: 3, titulo: 1, sub: 8, head: 2, pct: 4, dec: 5, total: 6, totalPct: 7, nota: 8, notaTit: 9, texto: 10 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF1F4E79"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="9" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="9" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Celda: número → <v>, texto → inlineStr, null/'' → vacía con estilo
function cell(ref, val, st) {
  const s = st != null ? ` s="${st}"` : '';
  if (val == null || val === '') return `<c r="${ref}"${s}/>`;
  if (typeof val === 'number' && isFinite(val)) return `<c r="${ref}"${s}><v>${val}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(val)}</t></is></c>`;
}
function hoja(filas, { cols = [], merges = [], drawing = false, freeze = 0 } = {}) {
  const rowsXml = filas.map((f, i) => {
    if (!f) return '';
    const r = i + 1;
    const ht = f.ht ? ` ht="${f.ht}" customHeight="1"` : '';
    return `<row r="${r}"${ht}>${f.c.map((c, j) => (c === undefined ? '' : cell(colL(j) + r, c.v, c.s))).join('')}</row>`;
  }).join('');
  const pane = freeze ? `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols.length ? `<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}
<sheetData>${rowsXml}</sheetData>
${merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
${drawing ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

const strCache = (arr) => `<c:strCache><c:ptCount val="${arr.length}"/>${arr.map((v, i) => `<c:pt idx="${i}"><c:v>${x(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
const numCache = (arr) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${arr.length}"/>${arr.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;
const tituloChart = (t) => `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"/></a:pPr><a:r><a:rPr lang="es-CL" sz="1300" b="1"/><a:t>${x(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
const chartWrap = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart>${body}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
</c:chartSpace>`;
const dLbls = (val, pct) => `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${val ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pct ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;

function chartBarras(hojaN, r1, r2, nombres, series) {
  const cats = `<c:cat><c:strRef><c:f>'${hojaN}'!$A$${r1}:$A$${r2}</c:f>${strCache(nombres)}</c:strRef></c:cat>`;
  const ser = series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>
<c:tx><c:strRef><c:f>'${hojaN}'!$${s.col}$${r1 - 1}</c:f>${strCache([s.nombre])}</c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>
${cats}<c:val><c:numRef><c:f>'${hojaN}'!$${s.col}$${r1}:$${s.col}$${r2}</c:f>${numCache(s.vals)}</c:numRef></c:val></c:ser>`).join('');
  return chartWrap(`${tituloChart('Visitas asignadas vs. completadas por técnico')}<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}${dLbls(true, false)}
<c:gapWidth val="70"/><c:axId val="50010"/><c:axId val="50020"/></c:barChart>
<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>
<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="E7E6E6"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="50010"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>`);
}
function chartTorta(hojaN, r1, r2, nombres, vals) {
  return chartWrap(`${tituloChart('Distribución del trabajo (visitas completadas)')}<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/><c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>
<c:tx><c:strRef><c:f>'${hojaN}'!$C$${r1 - 1}</c:f>${strCache(['Completadas'])}</c:strRef></c:tx>
${dLbls(false, true)}
<c:cat><c:strRef><c:f>'${hojaN}'!$A$${r1}:$A$${r2}</c:f>${strCache(nombres)}</c:strRef></c:cat>
<c:val><c:numRef><c:f>'${hojaN}'!$C$${r1}:$C$${r2}</c:f>${numCache(vals)}</c:numRef></c:val></c:ser>
<c:firstSliceAng val="0"/></c:pieChart></c:plotArea><c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>`);
}
function anchor(id, c1, r1, c2, r2) {
  return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id + 1}" name="Grafico ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

/**
 * Arma el .xlsx. data = { empresa, periodo, generado, tecnicos:[{nombre, asignadas, completadas, cumplimiento(0-1),
 *   activas, canceladas, cancCliente, aporte(0-1), participacion, diasTrab, porDia, demora, ultimo}], visitas:[{...}] }
 * Devuelve [{ name, data }] listo para makeZip.
 */
export function construirInformeXlsx(data) {
  const H1 = 'Rendimiento';
  const T = data.tecnicos || [];
  const heads = ['Técnico', 'Visitas asignadas', 'Completadas', '% Cumplimiento', 'Pendientes activas', 'Canceladas', 'Canceladas por el cliente', '% del trabajo del equipo', 'Participación', 'Días trabajados', 'Cierres por día trabajado', 'Demora promedio al cerrar (días)', 'Último cierre'];
  const filas = [];
  filas.push({ ht: 24, c: [{ v: `${data.empresa || 'WIFIRED'} · Informe de rendimiento por técnico`, s: S.titulo }] });
  filas.push({ c: [{ v: `Período: ${data.periodo} · Generado: ${data.generado}`, s: S.sub }] });
  filas.push(null);
  filas.push({ ht: 46, c: heads.map((h) => ({ v: h, s: S.head })) });
  const r1 = 5;
  T.forEach((t) => filas.push({ c: [
    { v: t.nombre, s: S.texto }, { v: t.asignadas, s: S.normal }, { v: t.completadas, s: S.normal }, { v: t.cumplimiento, s: S.pct },
    { v: t.activas, s: S.normal }, { v: t.canceladas, s: S.normal }, { v: t.cancCliente, s: S.normal }, { v: t.aporte, s: S.pct },
    { v: t.participacion, s: S.normal }, { v: t.diasTrab, s: S.normal }, { v: t.porDia ?? '—', s: S.dec }, { v: t.demora ?? '—', s: S.dec }, { v: t.ultimo || '—', s: S.normal },
  ] }));
  const r2 = r1 + T.length - 1;
  const sum = (k) => T.reduce((s, t) => s + (Number(t[k]) || 0), 0);
  const baseTot = sum('asignadas') - sum('cancCliente');
  filas.push({ c: [
    { v: 'Total equipo', s: S.total }, { v: sum('asignadas'), s: S.total }, { v: sum('completadas'), s: S.total },
    { v: baseTot > 0 ? sum('completadas') / baseTot : 0, s: S.totalPct }, { v: sum('activas'), s: S.total }, { v: sum('canceladas'), s: S.total },
    { v: sum('cancCliente'), s: S.total }, { v: T.length ? 1 : 0, s: S.totalPct }, { v: '', s: S.total }, { v: '', s: S.total }, { v: '', s: S.total }, { v: '', s: S.total }, { v: '', s: S.total },
  ] });
  filas.push(null);
  const notas = [
    '¿Cómo leer este informe?',
    '• % Cumplimiento: visitas completadas ÷ visitas asignadas (sin contar las que canceló el cliente).',
    '• % del trabajo del equipo: qué parte de todas las visitas completadas hizo cada técnico.',
    '• Participación: Alta / Media / Baja comparando con el promedio del equipo (Media = cerca del promedio).',
    '• Cierres por día trabajado: promedio de visitas completadas en los días en que trabajó.',
    '• Demora promedio al cerrar: días entre la fecha agendada y el cierre (0 = el mismo día).',
  ];
  notas.forEach((n, i) => filas.push({ c: [{ v: n, s: i ? S.nota : S.notaTit }] }));
  const filaGraf = filas.length + 1; // índice 0-based de la fila donde parten los gráficos

  const files = [];
  const add = (name, s) => files.push({ name, data: enc.encode(s) });
  const conGraf = T.length > 0;
  add(`xl/worksheets/sheet1.xml`, hoja(filas, { cols: [24, 11, 12, 13, 12, 11, 13, 13, 13, 11, 13, 15, 13], merges: ['A1:M1', 'A2:M2'], drawing: conGraf, freeze: 4 }));

  // Hoja 2: detalle de visitas
  const V = data.visitas || [];
  const hv = ['N° OT', 'Fecha', 'Técnico', 'Cliente', 'Tipo de visita', 'Nodo', 'Zona', 'Estado'];
  const filas2 = [{ ht: 22, c: [{ v: `Detalle de visitas · ${data.periodo}`, s: S.titulo }] }, null, { ht: 22, c: hv.map((h) => ({ v: h, s: S.head })) }];
  V.forEach((v) => filas2.push({ c: [v.ot, v.fecha, v.tecnico, v.cliente, v.tipo, v.nodo, v.zona, v.estado].map((val) => ({ v: val || '', s: S.texto })) }));
  add(`xl/worksheets/sheet2.xml`, hoja(filas2, { cols: [18, 12, 22, 30, 28, 18, 12, 14], merges: ['A1:H1'], freeze: 3 }));

  if (conGraf) {
    add('xl/worksheets/_rels/sheet1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
    add('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${anchor(1, 0, filaGraf, 7, filaGraf + 20)}${anchor(2, 7, filaGraf, 13, filaGraf + 20)}</xdr:wsDr>`);
    add('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/></Relationships>`);
    const nombres = T.map((t) => t.nombre);
    add('xl/charts/chart1.xml', chartBarras(H1, r1, r2, nombres, [
      { col: 'B', nombre: 'Visitas asignadas', color: '9DC3E6', vals: T.map((t) => t.asignadas) },
      { col: 'C', nombre: 'Completadas', color: '1F4E79', vals: T.map((t) => t.completadas) },
    ]));
    add('xl/charts/chart2.xml', chartTorta(H1, r1, r2, nombres, T.map((t) => t.completadas)));
  }

  add('xl/styles.xml', STYLES);
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${H1}" sheetId="1" r:id="rId1"/><sheet name="Detalle" sheetId="2" r:id="rId2"/></sheets></workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${conGraf ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` : ''}
</Types>`);
  // [Content_Types].xml primero (algunos lectores lo esperan así)
  return files.reverse();
}

export function descargarInformeXlsx(filename, data) {
  const zip = makeZip(construirInformeXlsx(data));
  const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

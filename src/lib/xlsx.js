/*
 * Escritor de Excel (.xlsx) mínimo e em fio.
 *
 * Porquê não o ExcelJS? Em testes com 44 000 linhas x 84 colunas, o modo
 * "streaming" do ExcelJS chegou aos 300 MB de memória. Aqui cada linha é
 * convertida em XML e entregue ao zip, que só pede mais quando consegue enviar
 * para o browser. A memória fica estável (alguns MB), seja qual for o tamanho.
 *
 * O ficheiro tem uma folha, sem estilos, com todas as células como texto.
 */
const archiver = require('archiver');
const { PassThrough } = require('stream');
const { once } = require('events');

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  + '</Types>';

const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
  + '</Relationships>';

const WORKBOOK = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
  + '<sheets><sheet name="Contactos" sheetId="1" r:id="rId1"/></sheets></workbook>';

const WORKBOOK_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
  + '</Relationships>';

const SHEET_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
const SHEET_TAIL = '</sheetData></worksheet>';

// Caracteres de controlo não são válidos em XML.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function escapeXml(value) {
  return String(value)
    .replace(CONTROL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowXml(values) {
  let xml = '<row>';
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || v === '') {
      xml += '<c/>';
    } else {
      xml += `<c t="inlineStr"><is><t xml:space="preserve">${escapeXml(v).slice(0, 32000)}</t></is></c>`;
    }
  }
  return `${xml}</row>`;
}

/*
 * Escreve um .xlsx para `out` a partir de um iterável assíncrono de linhas
 * (cada linha é uma lista de valores). Para depois de `maxRows` linhas.
 */
async function writeXlsx(out, rows, maxRows = Infinity) {
  const zip = archiver('zip', { zlib: { level: 6 } });
  const done = new Promise((resolve, reject) => {
    zip.on('error', reject);
    out.on('error', reject);
    out.on('close', resolve);
    out.on('finish', resolve);
  });
  zip.pipe(out);
  zip.append(CONTENT_TYPES, { name: '[Content_Types].xml' });
  zip.append(ROOT_RELS, { name: '_rels/.rels' });
  zip.append(WORKBOOK, { name: 'xl/workbook.xml' });
  zip.append(WORKBOOK_RELS, { name: 'xl/_rels/workbook.xml.rels' });

  const sheet = new PassThrough({ highWaterMark: 256 * 1024 });
  zip.append(sheet, { name: 'xl/worksheets/sheet1.xml' });
  const finalized = zip.finalize();

  sheet.write(SHEET_HEAD);
  let n = 0;
  for await (const values of rows) {
    if (n >= maxRows) break;
    if (!sheet.write(rowXml(values))) await once(sheet, 'drain');
    n += 1;
  }
  sheet.end(SHEET_TAIL);
  await finalized;
  await done;
  return n;
}

module.exports = { writeXlsx, rowXml, escapeXml };

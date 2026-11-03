/*
 * Exportação de lotes em fio (streaming), para a memória não crescer com o tamanho.
 *
 *  - CSV: o Postgres escreve o ficheiro (COPY ... TO STDOUT) e a app só o passa
 *    ao browser aos bocados. Sem limite de linhas.
 *  - Excel: o mesmo fluxo é lido linha a linha e escrito em .xlsx em fio
 *    (src/lib/xlsx.js). Limite de 50 000 linhas por ficheiro.
 *
 * O SQL do COPY não aceita parâmetros, por isso só leva o id do lote (inteiro,
 * validado) e expressões fixas definidas aqui.
 */
const { pipeline } = require('stream/promises');
const { to: copyTo } = require('pg-copy-streams');
const { parse } = require('csv-parse');
const { writeXlsx } = require('./xlsx');
const { pool } = require('../db');
const seg = require('./segment');

const EXCEL_MAX_ROWS = 50000;

const TAGS_EXPR = `(SELECT string_agg(t.name, ', ' ORDER BY t.name)
                      FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
                     WHERE ct.contact_id = c.id)`;

// Campos sensíveis: nunca saem nos modelos normais.
const SENSITIVE = new Set([
  'nif', 'nif_1', 'nif_2', 'numero_do_documento', 'tipo_de_documento_id',
  'carto_de_cidado_n', 'carto_de_cidado_n_ee', 'data_de_nascimento',
]);
const INTERNAL = new Set(['deleted_at', 'deleted_reason']);

const LIST_COLUMNS = [
  ['id', 'ID'], ['chavealunounmaze', 'Chave Unmaze'], ['name', 'Nome'], ['escola', 'Escola'],
  ['ano_escolar', 'Ano'], ['turma_1', 'Turma'], ['nome_de_encarregado_d', 'Encarregado de Educação'],
  ['telefone', 'Telefone'], ['telemvel', 'Telemóvel'], ['telefone_1', 'Telefone 1'], ['telefone_2', 'Telefone 2'],
  ['telefone_3', 'Telefone 3'], ['phone_number', 'Telefone (phone_number)'], ['email', 'Email'], ['email_ee', 'Email do EE'], ['email_ee_1', 'Email do EE (2)'],
  ['polo', 'Polo'],
  ['localidade', 'Localidade'], ['cod_postal', 'Cód. Postal'], ['campanha_actual', 'Campanha'],
  ['status_name', 'Estado'],
];

function q(label) {
  return `"${label.replace(/"/g, '""')}"`;
}

/*
 * Modelo para importar no Zoho Bigin (módulo Contactos).
 * Contacto = encarregado de educação; Empresa (Account Name) = escola.
 * Se o nome do EE só tiver uma palavra, vai para "Last Name" (campo obrigatório no Bigin).
 */
const BIGIN_SELECT = [
  `CASE WHEN btrim(coalesce(c.nome_de_encarregado_d,'')) ~ '\\s' THEN split_part(btrim(c.nome_de_encarregado_d), ' ', 1) ELSE '' END AS ${q('First Name')}`,
  `CASE WHEN btrim(coalesce(c.nome_de_encarregado_d,'')) ~ '\\s' THEN regexp_replace(btrim(c.nome_de_encarregado_d), '^\\S+\\s+', '') ELSE coalesce(NULLIF(btrim(c.nome_de_encarregado_d),''), NULLIF(btrim(c.name),''), 'Sem nome') END AS ${q('Last Name')}`,
  `${seg.FIRST_EMAIL_SQL} AS ${q('Email')}`,
  `${seg.MOBILE_SQL} AS ${q('Mobile')}`,
  `${seg.OTHER_PHONE_SQL} AS ${q('Phone')}`,
  `NULLIF(btrim(c.escola),'') AS ${q('Account Name')}`,
  `NULLIF(btrim(c.rua),'') AS ${q('Mailing Street')}`,
  `coalesce(NULLIF(btrim(c.localidade),''), NULLIF(btrim(c.polo),'')) AS ${q('Mailing City')}`,
  `NULLIF(btrim(c.cod_postal),'') AS ${q('Mailing Zip')}`,
  `'Educando: ' || coalesce(NULLIF(btrim(c.name),''), '-') || ' | Ano: ' || coalesce(NULLIF(btrim(c.ano_escolar),''), '-') || ' | Campanha: ' || coalesce(NULLIF(btrim(c.campanha_actual),''), '-') || ' | Telefones: ' || coalesce(${seg.PHONES_SQL}, '-') || ' | Emails: ' || coalesce(${seg.EMAILS_SQL}, '-') AS ${q('Description')}`,
  `${TAGS_EXPR} AS ${q('Tag')}`,
  `c.chavealunounmaze AS ${q('Chave Unmaze')}`,
].join(',\n  ');

const PRESETS = {
  bigin: { label: 'Modelo Zoho Bigin (encarregado de educação)', admin: false },
  lista: { label: 'Colunas da lista de contactos', admin: false },
  completo: { label: 'Todos os campos, sem dados sensíveis', admin: false },
  completo_sensivel: { label: 'Todos os campos, com NIF, documentos e nascimento', admin: true },
};

let contactColumnsCache = null;
async function contactColumns() {
  if (contactColumnsCache) return contactColumnsCache;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'contacts' AND table_schema = current_schema()
      ORDER BY ordinal_position`,
  );
  contactColumnsCache = rows.map((r) => r.column_name);
  return contactColumnsCache;
}

async function selectListFor(preset) {
  if (preset === 'bigin') return BIGIN_SELECT;
  if (preset === 'lista') {
    return [...LIST_COLUMNS.map(([k, l]) => `c.${q(k)} AS ${q(l)}`), `${TAGS_EXPR} AS ${q('Etiquetas')}`].join(', ');
  }
  const cols = (await contactColumns()).filter((k) => !INTERNAL.has(k)
    && (preset === 'completo_sensivel' || !SENSITIVE.has(k)));
  return [...cols.map((k) => `c.${q(k)}`), `${TAGS_EXPR} AS ${q('etiquetas')}`].join(', ');
}

async function batchSql(batchId, preset) {
  const id = parseInt(batchId, 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error('lote inválido');
  const select = await selectListFor(preset);
  return `SELECT ${select}
            FROM contacts c
            JOIN export_batch_contacts b ON b.contact_id = c.id AND b.batch_id = ${id}
           WHERE c.deleted_at IS NULL
           ORDER BY c.id`;
}

// Uma exportação de cada vez por utilizador, para não haver picos de memória somados.
const running = new Set();

async function streamBatch({ batchId, preset, format, filename, userId, req, res }) {
  if (running.has(userId)) {
    const err = new Error('Já tens uma exportação a decorrer. Espera que termine.');
    err.status = 429;
    throw err;
  }
  running.add(userId);
  const client = await pool.connect();
  let copy;
  const abort = () => { if (copy) copy.destroy(); };
  req.on('close', abort);
  try {
    const sql = await batchSql(batchId, preset);
    copy = client.query(copyTo(`COPY (${sql}) TO STDOUT WITH (FORMAT csv, HEADER true)`));

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.write('﻿'); // BOM: o Excel abre os acentos corretamente
      await pipeline(copy, res);
      return;
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    const parser = copy.pipe(parse({ bom: false, relax_quotes: true }));
    await writeXlsx(res, parser, EXCEL_MAX_ROWS + 1); // +1 = linha de títulos
  } finally {
    req.off('close', abort);
    client.release();
    running.delete(userId);
  }
}

module.exports = { PRESETS, EXCEL_MAX_ROWS, streamBatch };

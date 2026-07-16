const express = require('express');
const ExcelJS = require('exceljs');
const { pool } = require('../db');

const router = express.Router();

/*
 * Campos-chave disponíveis para pesquisa/filtragem.
 * Nomes de coluna reais do Contactos_Consolidado.csv (ver migrations/002_contacts.sql),
 * sanitizados da mesma forma que scripts/import_csv.js.
 */
const SEARCHABLE_FIELDS = [
  { key: 'name', label: 'Nome (aluno)' },
  { key: 'nome_de_encarregado_d', label: 'Encarregado de Educação' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'telemvel', label: 'Telemóvel' },
  { key: 'email', label: 'Email' },
  { key: 'email_ee', label: 'Email do EE' },
  { key: 'escola', label: 'Escola' },
  { key: 'localidade', label: 'Localidade' },
  { key: 'cod_postal', label: 'Código Postal' },
  { key: 'nif', label: 'NIF' },
  { key: 'campanha_actual', label: 'Campanha' },
  { key: 'chavealunounmaze', label: 'Chave Unmaze' },
];

const LIST_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'chavealunounmaze', label: 'Chave Unmaze' },
  { key: 'name', label: 'Nome' },
  { key: 'escola', label: 'Escola' },
  { key: 'ano_escolar', label: 'Ano' },
  { key: 'turma_1', label: 'Turma' },
  { key: 'nome_de_encarregado_d', label: 'Encarregado de Educação' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'telemvel', label: 'Telemóvel' },
  { key: 'email', label: 'Email' },
  { key: 'localidade', label: 'Localidade' },
  { key: 'cod_postal', label: 'Cód. Postal' },
  { key: 'campanha_actual', label: 'Campanha' },
  { key: 'status_name', label: 'Estado' },
];

const PAGE_SIZE = 50;

function buildWhereClause(query) {
  const clauses = ['deleted_at IS NULL'];
  const values = [];

  if (query.q && query.field) {
    const field = SEARCHABLE_FIELDS.find((f) => f.key === query.field);
    if (field) {
      values.push(`%${query.q}%`);
      clauses.push(`"${field.key}" ILIKE $${values.length}`);
    }
  } else if (query.q) {
    // pesquisa livre em todos os campos-chave
    const orParts = SEARCHABLE_FIELDS.map((f) => {
      values.push(`%${query.q}%`);
      return `"${f.key}" ILIKE $${values.length}`;
    });
    clauses.push(`(${orParts.join(' OR ')})`);
  }

  return { where: clauses.join(' AND '), values };
}

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const { where, values } = buildWhereClause(req.query);

  const countResult = await pool.query(`SELECT count(*)::int AS n FROM contacts WHERE ${where}`, values);
  const total = countResult.rows[0].n;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const listValues = [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE];
  const { rows } = await pool.query(
    `SELECT * FROM contacts WHERE ${where} ORDER BY id DESC LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );

  res.render('contacts/list', {
    rows,
    columns: LIST_COLUMNS,
    searchableFields: SEARCHABLE_FIELDS,
    query: req.query,
    total,
    page,
    totalPages,
  });
});

async function fetchRowsForExport(ids, query) {
  if (ids && ids.length > 0) {
    const { rows } = await pool.query('SELECT * FROM contacts WHERE id = ANY($1) AND deleted_at IS NULL', [ids]);
    return rows;
  }
  const { where, values } = buildWhereClause(query);
  const { rows } = await pool.query(`SELECT * FROM contacts WHERE ${where} ORDER BY id DESC`, values);
  return rows;
}

router.post('/export', async (req, res) => {
  const selectedIds = (req.body.ids || '')
    .split(',')
    .map((v) => parseInt(v, 10))
    .filter((v) => !Number.isNaN(v));

  const rows = await fetchRowsForExport(selectedIds, req.body);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contactos');
  sheet.columns = LIST_COLUMNS.map((c) => ({ header: c.label, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  await pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
    req.session.user.id,
    'export',
    JSON.stringify({ count: rows.length, selected: selectedIds.length > 0 }),
  ]);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="contactos_export_${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;

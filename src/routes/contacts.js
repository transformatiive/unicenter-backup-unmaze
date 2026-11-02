const express = require('express');
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

// Agrupamento e etiquetas legíveis para a página de detalhe (todas as colunas reais).
const FIELD_GROUPS = [
  {
    title: 'Aluno',
    fields: [
      ['name', 'Nome'],
      ['data_de_nascimento', 'Data de nascimento'],
      ['sexo_id', 'Sexo'],
      ['gnero_id', 'Género'],
      ['nif', 'NIF'],
      ['numero_do_documento', 'Nº documento'],
      ['carto_de_cidado_n', 'Cartão de cidadão'],
      ['habilitaes_literrias', 'Habilitações literárias'],
    ],
  },
  {
    title: 'Escola',
    fields: [
      ['escola', 'Escola'],
      ['polo', 'Polo'],
      ['ano_escolar', 'Ano escolar'],
      ['turma_1', 'Turma'],
      ['ano_letivo_novo', 'Ano letivo'],
      ['ano_1', 'Ano'],
      ['ano_lectivo_1', 'Ano letivo (alt.)'],
    ],
  },
  {
    title: 'Contactos',
    fields: [
      ['telefone', 'Telefone'],
      ['telemvel', 'Telemóvel'],
      ['telefone_1', 'Telefone 1'],
      ['telefone_2', 'Telefone 2'],
      ['telefone_3', 'Telefone 3'],
      ['phone_number', 'Telefone (phone_number)'],
      ['email', 'Email'],
      ['email_ee', 'Email do EE'],
      ['email_ee_1', 'Email do EE (2)'],
    ],
  },
  {
    title: 'Morada',
    fields: [
      ['rua', 'Rua'],
      ['localidade', 'Localidade'],
      ['cod_postal', 'Código postal'],
    ],
  },
  {
    title: 'Encarregado de Educação',
    fields: [
      ['nome_de_encarregado_d', 'Nome do EE'],
      ['nome_de_encarregado_d_1', 'Nome do EE (2)'],
      ['carto_de_cidado_n_ee', 'Cartão de cidadão do EE'],
      ['nif_1', 'NIF (1)'],
      ['nif_2', 'NIF (2)'],
      ['estado_civil_id', 'Estado civil'],
      ['estado_civil_1_id', 'Estado civil (alt.)'],
      ['profisso', 'Profissão'],
      ['profisso_1', 'Profissão (2)'],
      ['habilitacaoes_do_enca_id', 'Habilitações do EE'],
      ['tipo_de_filiao_id', 'Tipo de filiação'],
    ],
  },
  {
    title: 'Campanha / Estado',
    fields: [
      ['campanha_actual', 'Campanha atual'],
      ['campanhas_passadas_ss', 'Campanhas passadas'],
      ['status_name', 'Estado'],
      ['estado_contacto_id', 'Estado do contacto'],
      ['tipologia_marketing_id', 'Tipologia de marketing'],
      ['channel_id', 'Canal'],
      ['referral_id', 'Referral'],
      ['inscrito_no_curso_ss', 'Inscrito no curso'],
      ['nome_do_projecto_ss', 'Projeto'],
      ['resultado_id', 'Resultado'],
      ['pipe_id', 'Pipe'],
    ],
  },
  {
    title: 'Marcação / Calendário',
    fields: [
      ['marcacao', 'Marcação'],
      ['tem_hora_marcada', 'Tem hora marcada'],
      ['horrio_preferido_id', 'Horário preferido'],
      ['webinar_ss', 'Webinar'],
      ['webinar_presenca_ss', 'Presença no webinar'],
    ],
  },
  {
    title: 'Observações',
    fields: [
      ['obs_aluno', 'Observações (aluno)'],
      ['obs_ee', 'Observações (EE)'],
      ['observaes', 'Observações'],
    ],
  },
  {
    title: 'Identificadores',
    fields: [
      ['chavealunounmaze', 'Chave aluno Unmaze'],
      ['chavealuno', 'Chave aluno'],
      ['chaveee', 'Chave EE'],
      ['id_import', 'ID import'],
      ['id_entidade_crm', 'ID entidade CRM'],
      ['id_akademis', 'ID akademis'],
      ['contact_id', 'Contact ID'],
      ['address_id', 'Address ID'],
      ['organization_id', 'Organização'],
      ['source_unmaze', 'Origem Unmaze'],
    ],
  },
  {
    title: 'Datas',
    fields: [
      ['data_de_atribuio_do_c', 'Data de atribuição'],
      ['data_de_insero_akadem', 'Data de inserção (akademis)'],
      ['createdat', 'Criado em (origem)'],
      ['updatedat', 'Atualizado em (origem)'],
      ['created_at', 'Criado no sistema'],
      ['updated_at', 'Atualizado no sistema'],
    ],
  },
];

// Colunas internas que não interessam na página de detalhe.
const HIDDEN_DETAIL_KEYS = new Set(['deleted_at', 'deleted_reason']);

const PAGE_SIZE_OPTIONS = [100, 250, 500];
const DEFAULT_PAGE_SIZE = 500;

// Colunas realmente necessárias para a listagem (evita SELECT * de 89 colunas).
const LIST_SELECT = Array.from(new Set(['id', ...LIST_COLUMNS.map((c) => c.key)]))
  .map((c) => `"${c}"`)
  .join(', ');

function resolvePageSize(raw) {
  const n = parseInt(raw, 10);
  return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

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

router.get('/', async (req, res, next) => {
  try {
    const pageSize = resolvePageSize(req.query.pageSize);
    const { where, values } = buildWhereClause(req.query);

    const countResult = await pool.query(`SELECT count(*)::int AS n FROM contacts WHERE ${where}`, values);
    const total = countResult.rows[0].n;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);

    const listValues = [...values, pageSize, (page - 1) * pageSize];
    const { rows } = await pool.query(
      `SELECT ${LIST_SELECT} FROM contacts WHERE ${where} ORDER BY id DESC LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );

    const fromRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const toRow = Math.min(page * pageSize, total);

    res.render('contacts/list', {
      rows,
      columns: LIST_COLUMNS,
      searchableFields: SEARCHABLE_FIELDS,
      query: req.query,
      total,
      page,
      totalPages,
      pageSize,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      fromRow,
      toRow,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM contacts WHERE id = $1 AND deleted_at IS NULL',
      [parseInt(req.params.id, 10)],
    );
    if (rows.length === 0) {
      return res.status(404).render('error', { message: 'Contacto não encontrado.' });
    }
    const row = rows[0];

    // Constrói os grupos apenas com os campos que existem, e junta as colunas
    // não catalogadas num grupo "Outros" (para nunca esconder dados).
    const covered = new Set();
    const groups = FIELD_GROUPS.map((g) => {
      const fields = g.fields
        .filter(([key]) => key in row)
        .map(([key, label]) => {
          covered.add(key);
          return { key, label, value: row[key] };
        });
      return { title: g.title, fields };
    }).filter((g) => g.fields.length > 0);

    const others = Object.keys(row)
      .filter((k) => !covered.has(k) && k !== 'id' && !HIDDEN_DETAIL_KEYS.has(k))
      .map((k) => ({ key: k, label: k.replace(/_/g, ' '), value: row[k] }));
    if (others.length > 0) groups.push({ title: 'Outros campos', fields: others });

    const title = row.name || row.chavealunounmaze || `Contacto #${row.id}`;
    // Preserva a pesquisa/paginação de onde viemos, para o botão "voltar".
    const backQuery = typeof req.query.back === 'string' ? req.query.back : '';

    const [{ rows: tags }, { rows: batches }] = await Promise.all([
      pool.query('SELECT t.id, t.name, t.color FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = $1 ORDER BY t.name', [row.id]),
      pool.query('SELECT b.id, b.name, b.status, b.created_at FROM export_batch_contacts x JOIN export_batches b ON b.id = x.batch_id WHERE x.contact_id = $1 ORDER BY b.id DESC', [row.id]),
    ]);

    return res.render('contacts/detail', { row, groups, title, backQuery, tags, batches });
  } catch (err) {
    return next(err);
  }
});

/*
 * A exportação antiga (Excel com tudo em memória) foi substituída por lotes:
 * "Exportar" na lista cria um lote em /lotes/pesquisa, que depois se descarrega
 * em CSV ou Excel em fio (ver src/lib/export.js).
 */

router.buildWhereClause = buildWhereClause;
module.exports = router;

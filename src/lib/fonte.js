/*
 * Ficheiros originais Unmaze: carregar, comparar com contacts e preencher vazios.
 *
 * Regras:
 *  - Nunca apaga nada. Nunca substitui um valor que já existe em contacts.
 *  - Só preenche campos que estão vazios em contacts e cheios no ficheiro.
 *  - Liga ficheiro e base de dados pela chave "chavealunounmaze" (única nos ficheiros).
 *  - Os nomes de coluna vêm de uma lista fixa (nunca do utilizador).
 *  - Nos registos (logs) só aparecem contagens, nunca dados pessoais.
 */
const fs = require('fs');
const { from: copyFrom } = require('pg-copy-streams');
const { parse } = require('csv-parse');
const { pool } = require('../db');

// Colunas do ficheiro original que também existem em contacts (mesmo nome).
const COLUMNS = [
  'id_import', 'chavealunounmaze', 'chavealuno', 'chaveee', 'user_owner_id', 'address_id',
  'organization_id', 'name', 'phone_number', 'email', 'createdat', 'updatedat', 'pipe_id',
  'resultado_id', 'telefone', 'telefone_1', 'sexo_id', 'nif', 'tipo_de_documento_id',
  'numero_do_documento', 'valido_at', 'turma_1', 'obs_aluno', 'nome_de_encarregado_d',
  'carto_de_cidado_n_ee', 'valido_at_1', 'estado_civil_id', 'profisso', 'email_ee',
  'tipo_de_filiao_id', 'nome_de_encarregado_d_1', 'email_ee_1', 'tipo_de_contacto_id', 'nif_1',
  'profisso_1', 'inscrito_no_curso_ss', 'carto_de_cidado_n', 'valido_at_2', 'estado_civil_1_id',
  'nif_2', 'campanhas_passadas_ss', 'pasta_documentos', 'campanha_actual',
  'tipologia_marketing_id', 'data_de_insero_akadem', 'cdigo_de_ao', 'id_akademis', 'telefone_2',
  'telemvel', 'telefone_3', 'obs_ee', 'escola', 'polo', 'ano_escolar', 'data_de_atribuio_do_c',
  'id_entidade_crm', 'rua', 'localidade', 'cod_postal', 'ano_letivo_novo',
];
const COLSET = new Set(COLUMNS);
const KEY = 'chavealunounmaze';
const PHONE_COLS = ['telemvel', 'telefone', 'telefone_1', 'telefone_2', 'telefone_3', 'phone_number'];
// Colunas que se podem preencher (a chave de ligação não).
const FILLABLE = COLUMNS.filter((c) => c !== KEY);

const LABELS = {
  name: 'Nome do aluno', nome_de_encarregado_d: 'Nome do EE', nome_de_encarregado_d_1: 'Nome do EE (2)',
  telemvel: 'Telemóvel', telefone: 'Telefone', telefone_1: 'Telefone 1', telefone_2: 'Telefone 2',
  telefone_3: 'Telefone 3', phone_number: 'Telefone (phone_number)', email: 'Email',
  email_ee: 'Email do EE', email_ee_1: 'Email do EE (2)', escola: 'Escola', polo: 'Polo',
  ano_escolar: 'Ano escolar', localidade: 'Localidade', cod_postal: 'Código postal', rua: 'Rua',
  campanha_actual: 'Campanha atual', campanhas_passadas_ss: 'Campanhas passadas', turma_1: 'Turma',
  nif: 'NIF', nif_1: 'NIF (1)', nif_2: 'NIF (2)', obs_aluno: 'Observações (aluno)', obs_ee: 'Observações (EE)',
};
function label(col) { return LABELS[col] || col; }

function sanitize(name, index) {
  let s = String(name || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = `col_${index}`;
  if (/^[0-9]/.test(s)) s = `c_${s}`;
  return s;
}

/* Lê só a primeira linha (cabeçalho) de um CSV. */
function readHeader(filePath) {
  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(filePath).pipe(parse({ to_line: 1, bom: true, relax_quotes: true }));
    let header = null;
    parser.on('data', (row) => { if (!header) header = row; });
    parser.on('end', () => (header ? resolve(header) : reject(new Error('Ficheiro vazio.'))));
    parser.on('error', reject);
  });
}

const empty = (x) => `NULLIF(btrim(${x}), '') IS NULL`;
const full = (x) => `NULLIF(btrim(${x}), '') IS NOT NULL`;
const norm = (col, x) => (PHONE_COLS.includes(col)
  ? `regexp_replace(${x}, '\\D', '', 'g')`
  : `lower(btrim(${x}))`);

/*
 * Carrega um ficheiro CSV para unmaze_fonte. Linhas que já lá estão (mesmo id)
 * ficam como estão, por isso pode carregar o mesmo ficheiro duas vezes.
 */
async function loadFile(filePath, fileName) {
  const raw = await readHeader(filePath);
  const cols = raw.map((h, i) => sanitize(h, i));
  if (!cols.includes('id') || !cols.includes(KEY)) {
    throw new Error('Este ficheiro não parece um export Unmaze: faltam as colunas "id" e "chaveAlunoUnmaze".');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE fonte_stage (${cols.map((c) => `"${c}" TEXT`).join(', ')}) ON COMMIT DROP`);
    await new Promise((resolve, reject) => {
      const stream = client.query(copyFrom(
        `COPY fonte_stage (${cols.map((c) => `"${c}"`).join(', ')}) FROM STDIN WITH (FORMAT csv, HEADER true)`,
      ));
      const file = fs.createReadStream(filePath);
      file.on('error', reject);
      stream.on('error', reject);
      stream.on('finish', resolve);
      file.pipe(stream);
    });
    const known = cols.filter((c) => COLSET.has(c));
    const ignored = cols.filter((c) => c !== 'id' && !COLSET.has(c) && !/^col_\d+$/.test(c));
    const { rows: cnt } = await client.query('SELECT count(*)::int AS n FROM fonte_stage');
    const ins = await client.query(
      `INSERT INTO unmaze_fonte (fonte_id, ficheiro, ${known.join(', ')})
       SELECT btrim("id"), $1, ${known.map((c) => `"${c}"`).join(', ')} FROM fonte_stage
        WHERE NULLIF(btrim("id"), '') IS NOT NULL
       ON CONFLICT (fonte_id) DO NOTHING`,
      [String(fileName || '').slice(0, 200)],
    );
    await client.query('COMMIT');
    return { linhas: cnt[0].n, novas: ins.rowCount, jaExistiam: cnt[0].n - ins.rowCount, ignoradas: ignored };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function loadedSummary() {
  const { rows } = await pool.query(
    `SELECT ficheiro, count(*)::int AS n, max(carregado_em) AS em
       FROM unmaze_fonte GROUP BY ficheiro ORDER BY ficheiro`,
  );
  return rows;
}

const JOIN = `FROM unmaze_fonte f JOIN contacts c
               ON btrim(c.${KEY}) = btrim(f.${KEY}) AND c.deleted_at IS NULL`;

/* Faz a comparação completa. Devolve só contagens e ids de contacto de exemplo. */
async function compare() {
  const r = {};
  const totals = await pool.query(`SELECT
      (SELECT count(*)::int FROM unmaze_fonte) AS ficheiro,
      (SELECT count(*)::int FROM contacts WHERE deleted_at IS NULL) AS base,
      (SELECT count(*)::int FROM contacts WHERE deleted_at IS NOT NULL) AS base_apagados,
      (SELECT count(*)::int FROM unmaze_fonte f WHERE EXISTS (
          SELECT 1 FROM contacts c WHERE btrim(c.${KEY}) = btrim(f.${KEY}) AND c.deleted_at IS NULL)) AS ligados,
      (SELECT count(*)::int FROM contacts c WHERE c.deleted_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM unmaze_fonte f WHERE btrim(f.${KEY}) = btrim(c.${KEY}))) AS so_base,
      (SELECT count(*)::int FROM (SELECT btrim(${KEY}) FROM contacts WHERE deleted_at IS NULL
          GROUP BY 1 HAVING count(*) > 1) d) AS chaves_repetidas_base`);
  Object.assign(r, totals.rows[0]);
  r.so_ficheiro = r.ficheiro - r.ligados;

  const aggs = [];
  COLUMNS.forEach((col, i) => {
    const f = `f.${col}`;
    const c = `c.${col}`;
    aggs.push(`count(*) FILTER (WHERE ${full(f)} AND ${empty(c)})::int AS a${i}`);
    aggs.push(`count(*) FILTER (WHERE ${empty(f)} AND ${full(c)})::int AS b${i}`);
    aggs.push(`count(*) FILTER (WHERE ${full(f)} AND ${full(c)} AND ${norm(col, f)} <> ${norm(col, c)})::int AS d${i}`);
    aggs.push(`count(*) FILTER (WHERE ${full(f)} AND ${full(c)} AND ${norm(col, f)} = ${norm(col, c)})::int AS e${i}`);
  });
  const { rows } = await pool.query(`SELECT ${aggs.join(', ')} ${JOIN}`);
  const x = rows[0];
  r.colunas = COLUMNS.map((col, i) => ({
    col, label: label(col), faltaBase: x[`a${i}`], faltaFicheiro: x[`b${i}`], diferente: x[`d${i}`], igual: x[`e${i}`],
  }));

  // Telefones: números do ficheiro que não aparecem em nenhum campo de telefone da base.
  const arr = (alias) => `ARRAY[${PHONE_COLS.map((k) => `NULLIF(regexp_replace(coalesce(${alias}.${k}, ''), '\\D', '', 'g'), '')`).join(', ')}]`;
  const phones = await pool.query(`SELECT
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM unnest(${arr('f')}) p WHERE p IS NOT NULL AND NOT (p = ANY(${arr('c')}))))::int AS com_numeros_em_falta,
      count(*) FILTER (WHERE (SELECT count(DISTINCT p) FROM unnest(${arr('f')}) p WHERE p IS NOT NULL) >= 2)::int AS ficheiro_2_ou_mais,
      count(*) FILTER (WHERE (SELECT count(DISTINCT p) FROM unnest(${arr('c')}) p WHERE p IS NOT NULL) >= 2)::int AS base_2_ou_mais
    ${JOIN}`);
  r.telefones = phones.rows[0];
  const ex = await pool.query(`SELECT c.id ${JOIN}
     WHERE EXISTS (SELECT 1 FROM unnest(${arr('f')}) p WHERE p IS NOT NULL AND NOT (p = ANY(${arr('c')})))
     ORDER BY c.id LIMIT 10`);
  r.telefones.exemplos = ex.rows.map((y) => y.id);

  // Exemplos (ids) das colunas com valores diferentes, para ver na ficha do contacto.
  for (const item of r.colunas) {
    if (item.diferente > 0) {
      const col = item.col;
      // eslint-disable-next-line no-await-in-loop
      const e = await pool.query(`SELECT c.id ${JOIN}
         WHERE ${full(`f.${col}`)} AND ${full(`c.${col}`)} AND ${norm(col, `f.${col}`)} <> ${norm(col, `c.${col}`)}
         ORDER BY c.id LIMIT 5`);
      item.exemplos = e.rows.map((y) => y.id);
    }
  }
  return r;
}

/* Corre a comparação em segundo plano e guarda o resultado. */
async function startCompare(userId) {
  const { rows } = await pool.query(
    "INSERT INTO fonte_comparacoes (user_id) VALUES ($1) RETURNING id", [userId],
  );
  const id = rows[0].id;
  compare()
    .then(async (res) => {
      await pool.query(
        "UPDATE fonte_comparacoes SET estado = 'pronto', resultado = $2, terminado_em = now() WHERE id = $1",
        [id, JSON.stringify(res)],
      );
      // eslint-disable-next-line no-console
      console.log('[fonte] comparação', id, JSON.stringify({
        ficheiro: res.ficheiro, base: res.base, ligados: res.ligados, so_ficheiro: res.so_ficheiro,
        so_base: res.so_base, chaves_repetidas_base: res.chaves_repetidas_base, telefones: { ...res.telefones, exemplos: undefined },
        colunas: res.colunas.filter((y) => y.faltaBase || y.diferente).map((y) => [y.col, y.faltaBase, y.diferente, y.faltaFicheiro]),
      }));
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error('[fonte] comparação falhou', id, err.message);
      await pool.query(
        "UPDATE fonte_comparacoes SET estado = 'erro', erro = $2, terminado_em = now() WHERE id = $1",
        [id, String(err.message).slice(0, 500)],
      ).catch(() => {});
    });
  return id;
}

async function lastCompare() {
  const { rows } = await pool.query('SELECT * FROM fonte_comparacoes ORDER BY id DESC LIMIT 1');
  return rows[0] || null;
}

/*
 * Preenche, nas colunas escolhidas, os campos vazios em contacts com o valor do
 * ficheiro. Nunca muda um campo que já tem valor. Guarda que campos mudou.
 */
async function fill(runId, cols) {
  const list = cols.filter((c) => FILLABLE.includes(c));
  if (!list.length) throw new Error('Nenhuma coluna escolhida.');
  const gap = (col) => `(${empty(`c.${col}`)} AND ${full(`f.${col}`)})`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const log = await client.query(
      `INSERT INTO fonte_preenchimento_campos (preenchimento_id, contact_id, coluna)
       SELECT $1, c.id, v.coluna ${JOIN}
       CROSS JOIN LATERAL (VALUES ${list.map((col) => `('${col}', ${gap(col)})`).join(', ')}) AS v(coluna, falta)
        WHERE v.falta
       ON CONFLICT DO NOTHING`,
      [runId],
    );
    const upd = await client.query(
      `UPDATE contacts c SET
         ${list.map((col) => `${col} = CASE WHEN ${gap(col)} THEN btrim(f.${col}) ELSE c.${col} END`).join(',\n         ')},
         updated_at = now()
       FROM unmaze_fonte f
      WHERE btrim(c.${KEY}) = btrim(f.${KEY}) AND c.deleted_at IS NULL
        AND (${list.map(gap).join(' OR ')})`,
    );
    await client.query(
      "UPDATE fonte_preenchimentos SET estado = 'pronto', campos = $2, contactos = $3, terminado_em = now() WHERE id = $1",
      [runId, log.rowCount, upd.rowCount],
    );
    await client.query('COMMIT');
    return { campos: log.rowCount, contactos: upd.rowCount };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function startFill(userId, cols) {
  const list = cols.filter((c) => FILLABLE.includes(c));
  const { rows } = await pool.query(
    'INSERT INTO fonte_preenchimentos (user_id, colunas) VALUES ($1, $2) RETURNING id',
    [userId, JSON.stringify(list)],
  );
  const id = rows[0].id;
  await pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
    userId, 'fonte_fill_start', JSON.stringify({ run: id, colunas: list }),
  ]);
  fill(id, list)
    .then((res) => {
      // eslint-disable-next-line no-console
      console.log('[fonte] preenchimento', id, JSON.stringify(res));
      return pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
        userId, 'fonte_fill_done', JSON.stringify({ run: id, ...res }),
      ]);
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error('[fonte] preenchimento falhou', id, err.message);
      await pool.query(
        "UPDATE fonte_preenchimentos SET estado = 'erro', erro = $2, terminado_em = now() WHERE id = $1",
        [id, String(err.message).slice(0, 500)],
      ).catch(() => {});
    });
  return id;
}

async function fills() {
  const { rows } = await pool.query(
    `SELECT p.*, u.username FROM fonte_preenchimentos p LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.id DESC LIMIT 10`,
  );
  return rows;
}

module.exports = {
  COLUMNS, FILLABLE, PHONE_COLS, label, loadFile, loadedSummary, startCompare, lastCompare, startFill, fills, compare, fill,
};

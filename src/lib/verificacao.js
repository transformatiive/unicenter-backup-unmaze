/*
 * Verificação campo a campo contra os ficheiros originais Unmaze, sem copiar dados.
 *
 * Para cada coluna calcula uma "impressão digital": a soma, em todas as linhas, de
 * um número tirado do md5 de "chave|valor". Se a soma de uma coluna for igual à
 * calculada a partir dos ficheiros originais (scripts/verificar_ficheiros.py), então
 * todos os valores dessa coluna são iguais nos dois lados, linha a linha.
 * Também calcula a soma por 16 grupos de linhas, para localizar diferenças.
 *
 * Só guarda e regista números. Corre no arranque, no máximo uma vez por semana.
 */
const { pool } = require('../db');

const KEY = 'chavealunounmaze';
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

const h = (expr) => `('x' || substr(md5(${expr}), 1, 8))::bit(32)::bigint`;
const cell = (col) => h(`coalesce(${KEY}, '') || '|' || coalesce(${col}, '')`);
const bucket = `substr(md5(coalesce(${KEY}, '')), 1, 1)`;

async function checksums() {
  const sums = COLUMNS.map((c, i) => `sum(${cell(c)})::text AS s${i}`).join(', ');
  const { rows } = await pool.query(
    `SELECT ${bucket} AS b, count(*)::int AS n, ${sums} FROM contacts WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1`,
  );
  const out = { linhas: 0, colunas: {}, grupos: {} };
  COLUMNS.forEach((c) => { out.colunas[c] = 0n; out.grupos[c] = {}; });
  rows.forEach((r) => {
    out.linhas += r.n;
    COLUMNS.forEach((c, i) => {
      const v = BigInt(r[`s${i}`] || '0');
      out.colunas[c] += v;
      out.grupos[c][r.b] = v.toString();
    });
  });
  COLUMNS.forEach((c) => { out.colunas[c] = out.colunas[c].toString(); });
  return out;
}

/* No arranque: calcula se não houver uma verificação dos últimos 7 dias. */
async function runIfDue() {
  const { rows } = await pool.query(
    "SELECT 1 FROM verificacoes WHERE tipo = 'checksum' AND criado_em > now() - interval '7 days' LIMIT 1",
  );
  if (rows.length) return;
  const t0 = Date.now();
  const res = await checksums();
  await pool.query("INSERT INTO verificacoes (tipo, resultado) VALUES ('checksum', $1)", [JSON.stringify(res)]);
  // eslint-disable-next-line no-console
  console.log(`[verificacao] linhas=${res.linhas} em ${Math.round((Date.now() - t0) / 1000)}s`);
  COLUMNS.forEach((c) => {
    // eslint-disable-next-line no-console
    console.log(`[verificacao] ${c} ${res.colunas[c]} ${JSON.stringify(res.grupos[c])}`);
  });
}

module.exports = { COLUMNS, checksums, runIfDue };

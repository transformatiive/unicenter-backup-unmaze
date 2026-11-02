/*
 * Quadro cruzado: dimensões, filtros base e construção segura do WHERE.
 *
 * Regras:
 *  - As expressões SQL das dimensões são fixas aqui (nunca vêm do utilizador).
 *  - Valores escolhidos pelo utilizador entram sempre como parâmetros ($n).
 *  - Valores vazios (NULL ou só espaços) aparecem como "(vazio)".
 *  - Cada eixo mostra os valores mais frequentes; o resto junta-se em "Outros".
 */

const DIMENSIONS = {
  localidade: { label: 'Localidade', expr: "NULLIF(btrim(c.localidade), '')" },
  escola: { label: 'Escola', expr: "NULLIF(btrim(c.escola), '')" },
  ano_escolar: { label: 'Ano escolar', expr: "NULLIF(btrim(c.ano_escolar), '')" },
  campanha: { label: 'Campanha', expr: "NULLIF(btrim(c.campanha_actual), '')" },
  estado: { label: 'Estado', expr: "NULLIF(btrim(c.status_name), '')" },
  canal: { label: 'Canal', expr: "NULLIF(btrim(c.channel_id), '')" },
  cp4: { label: 'Código postal (4 dígitos)', expr: "NULLIF(left(btrim(c.cod_postal), 4), '')" },
  autorizacao: { label: 'Autorização de dados', expr: "NULLIF(btrim(c.autorizao_uso_dos_dad), '')" },
};

// Marcadores especiais nas células (não colidem com valores reais).
const EMPTY = '__vazio__';
const OTHERS = '__outros__';

const TOP_ROWS = 15;
const TOP_COLS = 12;

// "Tem autorização": o campo vem do export Unmaze como texto livre. Aceitamos as
// formas positivas conhecidas. A validar com os valores reais (ver README).
const AUTH_EXPR = "(lower(btrim(coalesce(c.autorizao_uso_dos_dad, ''))) IN ('sim','s','yes','y','true','t','1','x') "
  + "OR lower(btrim(coalesce(c.autorizao_uso_dos_dad, ''))) LIKE 'autoriz%')";

function isDim(key) {
  return Object.prototype.hasOwnProperty.call(DIMENSIONS, key);
}

function str(v, max = 300) {
  if (v === undefined || v === null) return '';
  return String(v).slice(0, max);
}

/*
 * Normaliza os critérios vindos do browser (query string ou JSON).
 * Tudo o que não for reconhecido é ignorado.
 */
function parseCriteria(raw = {}) {
  // Campos repetidos (ex.: hidden "0" + checkbox "1") chegam como lista: vale o último.
  const input = {};
  Object.keys(raw || {}).forEach((k) => {
    const v = raw[k];
    input[k] = Array.isArray(v) && !['rTop', 'cTop', 'cells'].includes(k) ? v[v.length - 1] : v;
  });
  const r = isDim(input.r) ? input.r : 'localidade';
  let c = isDim(input.c) ? input.c : 'ano_escolar';
  if (c === r) c = r === 'ano_escolar' ? 'localidade' : 'ano_escolar';

  const bool = (v, dflt) => {
    if (v === undefined || v === null || v === '') return dflt;
    return v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
  };

  const crit = {
    r,
    c,
    camp: str(input.camp),
    tag: parseInt(input.tag, 10) || null,
    aut: bool(input.aut, true),
    excl: bool(input.excl, true),
  };

  const asList = (v) => (Array.isArray(v) ? v.slice(0, 200).map((x) => str(x)) : []);
  crit.rTop = asList(input.rTop);
  crit.cTop = asList(input.cTop);
  crit.cells = Array.isArray(input.cells)
    ? input.cells.slice(0, 1000)
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({ r: str(x.r), c: str(x.c) }))
    : [];
  return crit;
}

/* Filtros comuns a tudo: não apagado, campanha, etiqueta, autorização, já enviados. */
function baseWhere(crit, params) {
  const parts = ['c.deleted_at IS NULL'];
  if (crit.camp) {
    params.push(crit.camp);
    parts.push(`${DIMENSIONS.campanha.expr} = $${params.length}`);
  }
  if (crit.tag) {
    params.push(crit.tag);
    parts.push(`EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = $${params.length})`);
  }
  if (crit.aut) parts.push(AUTH_EXPR);
  if (crit.excl) parts.push('NOT EXISTS (SELECT 1 FROM export_batch_contacts ebc WHERE ebc.contact_id = c.id)');
  return parts;
}

/* Condição de um eixo para um valor de célula (valor, vazio ou "Outros"). */
function axisCond(expr, value, top, params) {
  if (value === EMPTY) return `${expr} IS NULL`;
  if (value === OTHERS) {
    const real = top.filter((v) => v !== EMPTY && v !== OTHERS);
    params.push(real);
    return `(${expr} IS NOT NULL AND NOT (${expr} = ANY($${params.length}::text[])))`;
  }
  params.push(value);
  return `${expr} = $${params.length}`;
}

/*
 * WHERE completo da seleção (filtros base + células escolhidas).
 * Devolve null se não houver células (nada escolhido).
 */
function selectionWhere(crit, params) {
  if (!crit.cells.length) return null;
  const parts = baseWhere(crit, params);
  const re = DIMENSIONS[crit.r].expr;
  const ce = DIMENSIONS[crit.c].expr;
  const ors = crit.cells.map((cell) => {
    const a = axisCond(re, cell.r, crit.rTop, params);
    const b = axisCond(ce, cell.c, crit.cTop, params);
    return `(${a} AND ${b})`;
  });
  parts.push(`(${ors.join(' OR ')})`);
  return parts.join(' AND ');
}

/* Lista de valores mais frequentes num eixo (vazio conta como valor). */
async function topValues(pool, expr, where, params, limit) {
  const { rows } = await pool.query(
    `SELECT coalesce(${expr}, '${EMPTY}') AS v, count(*)::int AS n
       FROM contacts c WHERE ${where}
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${limit + 1}`,
    params,
  );
  return rows;
}

/*
 * Calcula o quadro: valores das linhas, valores das colunas e contagens.
 * Faz 3 leituras agregadas; o resultado tem no máximo (16 x 13) células.
 */
async function buildMatrix(pool, crit) {
  const params = [];
  const where = baseWhere(crit, params).join(' AND ');
  const re = DIMENSIONS[crit.r].expr;
  const ce = DIMENSIONS[crit.c].expr;

  const [rRows, cRows] = await Promise.all([
    topValues(pool, re, where, params, TOP_ROWS),
    topValues(pool, ce, where, params, TOP_COLS),
  ]);
  const rTop = rRows.slice(0, TOP_ROWS).map((x) => x.v);
  const cTop = cRows.slice(0, TOP_COLS).map((x) => x.v);
  const rHasOthers = rRows.length > TOP_ROWS;
  const cHasOthers = cRows.length > TOP_COLS;

  const p2 = params.slice();
  p2.push(rTop);
  const rIdx = p2.length;
  p2.push(cTop);
  const cIdx = p2.length;
  const { rows } = await pool.query(
    `SELECT
        CASE WHEN coalesce(${re}, '${EMPTY}') = ANY($${rIdx}::text[]) THEN coalesce(${re}, '${EMPTY}') ELSE '${OTHERS}' END AS r,
        CASE WHEN coalesce(${ce}, '${EMPTY}') = ANY($${cIdx}::text[]) THEN coalesce(${ce}, '${EMPTY}') ELSE '${OTHERS}' END AS c,
        count(*)::int AS n
       FROM contacts c WHERE ${where}
      GROUP BY 1, 2`,
    p2,
  );

  const rowsAxis = rHasOthers ? [...rTop, OTHERS] : rTop;
  const colsAxis = cHasOthers ? [...cTop, OTHERS] : cTop;
  const counts = {};
  let total = 0;
  rows.forEach((x) => {
    counts[`${x.r}\u0001${x.c}`] = x.n;
    total += x.n;
  });
  return { rowsAxis, colsAxis, counts, total, rTop, cTop };
}

function valueLabel(v) {
  if (v === EMPTY) return '(vazio)';
  if (v === OTHERS) return 'Outros';
  return v;
}

/* Texto curto para descrever uma seleção (usado no nome e na lista de lotes). */
function describe(crit) {
  const cells = crit.cells.map((x) => `${valueLabel(x.r)} · ${valueLabel(x.c)}`);
  const head = cells.slice(0, 4).join(', ');
  const more = cells.length > 4 ? ` e mais ${cells.length - 4}` : '';
  const extra = [];
  if (crit.camp) extra.push(`campanha ${crit.camp}`);
  if (crit.aut) extra.push('com autorização');
  return `${DIMENSIONS[crit.r].label} × ${DIMENSIONS[crit.c].label}: ${head}${more}${extra.length ? ` (${extra.join(', ')})` : ''}`;
}

module.exports = {
  DIMENSIONS,
  EMPTY,
  OTHERS,
  AUTH_EXPR,
  parseCriteria,
  baseWhere,
  selectionWhere,
  buildMatrix,
  valueLabel,
  describe,
};

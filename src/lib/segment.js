/*
 * Quadro cruzado: dimensões, filtros base e construção segura do WHERE.
 *
 * Regras:
 *  - As expressões SQL das dimensões são fixas aqui (nunca vêm do utilizador).
 *  - Valores escolhidos pelo utilizador entram sempre como parâmetros ($n).
 *  - Valores vazios (NULL ou só espaços) aparecem como "(vazio)".
 *  - Cada eixo mostra os valores mais frequentes; o resto junta-se em "Outros".
 */

/*
 * Chave normalizada de um texto livre (localidade, escola):
 * minúsculas, sem acentos, sem pontuação, espaços únicos.
 * Assim "Porto", "PORTO" e " porto." contam como o mesmo grupo.
 * Com abbr = true, também expande abreviaturas comuns de nomes de terras
 * ("V.N.Gaia" e "VNG" passam a "vila nova de gaia", "Sta." a "santa", "S." a "sao").
 * Nunca altera os dados guardados: é só a forma de agrupar no quadro.
 */
const ACCENTED = 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñºª';
// º e ª não têm par: o translate apaga-os ("5.º" fica "5").
const PLAIN = 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn';

/*
 * Erros e formas curtas conhecidas nos nomes de polo e localidade do backup
 * (vistos nos ficheiros originais em 2026-11-03). Chave já normalizada -> chave final.
 * Para juntar mais casos, acrescentar aqui.
 */
const PLACE_ALIASES = {
  'sao j madeiira': 'sao joao da madeira',
  'sao j madeira': 'sao joao da madeira',
  gaia: 'vila nova de gaia',
  'povoa santa iria': 'povoa de santa iria',
  'povoas santa iria': 'povoa de santa iria',
  'povoa st iria': 'povoa de santa iria',
  'povoa sta iria': 'povoa de santa iria',
  viana: 'viana do castelo',
  'viana de castelo': 'viana do castelo',
  'viana docastelo': 'viana do castelo',
  branganca: 'braganca',
  nraga: 'braga',
  portp: 'porto',
  'porto ir 2020': 'porto',
  'lisb oa': 'lisboa',
  'caldas das rainha': 'caldas da rainha',
  'castanheira dpo ribatejo': 'castanheira do ribatejo',
  valena: 'valenca',
  'polo famalicao': 'famalicao',
  'vila franca': 'vila franca de xira',
  'santa maria feira': 'santa maria da feira',
  'pacos de feereira': 'pacos de ferreira',
  'on line': 'online',
};

function withAliases(keyExpr) {
  const q = (t) => `'${t.replace(/'/g, "''")}'`;
  const whens = Object.keys(PLACE_ALIASES).map((k) => `WHEN ${q(k)} THEN ${q(PLACE_ALIASES[k])}`).join(' ');
  return `(CASE ${keyExpr} ${whens} ELSE ${keyExpr} END)`;
}

function normKey(col, abbr, dropWords) {
  let x = `lower(translate(coalesce(${col}, ''), '${ACCENTED}', '${PLAIN}'))`;
  x = `regexp_replace(${x}, '[^a-z0-9]+', ' ', 'g')`;
  if (abbr) {
    x = `regexp_replace(${x}, '\\mvng\\M', 'vila nova de gaia', 'g')`;
    x = `regexp_replace(${x}, '\\mv n\\M', 'vila nova', 'g')`;
    x = `regexp_replace(${x}, '\\mvila nova (?!(de|da|do|das|dos)\\M)(?=[a-z])', 'vila nova de ', 'g')`;
    x = `regexp_replace(${x}, '\\msta\\M', 'santa', 'g')`;
    x = `regexp_replace(${x}, '\\msto\\M', 'santo', 'g')`;
    x = `regexp_replace(${x}, '\\ms\\M', 'sao', 'g')`;
  }
  if (dropWords) x = `regexp_replace(${x}, '\\m(${dropWords})\\M', ' ', 'g')`;
  x = `regexp_replace(${x}, ' +', ' ', 'g')`;
  const key = `NULLIF(btrim(${x}), '')`;
  return abbr ? withAliases(key) : key;
}

const DIMENSIONS = {
  polo: { label: 'Polo (região)', expr: normKey('c.polo', true), raw: 'c.polo' },
  localidade: { label: 'Localidade', expr: normKey('c.localidade', true), raw: 'c.localidade' },
  escola: { label: 'Escola', expr: normKey('c.escola', false), raw: 'c.escola' },
  ano_escolar: { label: 'Ano escolar', expr: normKey('c.ano_escolar', false, 'ano'), raw: 'c.ano_escolar' },
  campanha: { label: 'Campanha', expr: "NULLIF(btrim(c.campanha_actual), '')" },
  estado: { label: 'Estado', expr: "NULLIF(btrim(c.status_name), '')" },
  canal: { label: 'Canal', expr: "NULLIF(btrim(c.channel_id), '')" },
  cp4: { label: 'Código postal (4 dígitos)', expr: "NULLIF(left(btrim(c.cod_postal), 4), '')" },
  autorizacao: { label: 'Autorização de dados', expr: "NULLIF(btrim(c.autorizao_uso_dos_dad), '')" },
};

/*
 * Todos os números de telefone de um contacto, sem repetidos, separados por " · ".
 * O backup Unmaze tem vários campos de telefone; mostramos todos.
 */
const PHONE_COLS = ['telemvel', 'telefone', 'telefone_1', 'telefone_2', 'telefone_3', 'phone_number'];
const PHONES_SQL = `(SELECT string_agg(p, ' · ' ORDER BY o) FROM (
    SELECT DISTINCT ON (regexp_replace(p, '\\D', '', 'g')) p, o
      FROM unnest(ARRAY[${PHONE_COLS.map((k) => `NULLIF(btrim(c.${k}), '')`).join(', ')}]) WITH ORDINALITY AS u(p, o)
     WHERE p IS NOT NULL
     ORDER BY regexp_replace(p, '\\D', '', 'g'), o) x)`;
const PHONE_ARRAY = `ARRAY[${PHONE_COLS.map((k) => `NULLIF(btrim(c.${k}), '')`).join(', ')}]`;
// Primeiro número que parece telemóvel português (9 dígitos a começar por 9).
const MOBILE_SQL = `(SELECT p FROM unnest(${PHONE_ARRAY}) WITH ORDINALITY AS u(p, o)
    WHERE regexp_replace(p, '\\D', '', 'g') ~ '^(00351|351)?9[0-9]{8}$' ORDER BY o LIMIT 1)`;
// Primeiro número diferente do telemóvel escolhido.
const OTHER_PHONE_SQL = `(SELECT p FROM unnest(${PHONE_ARRAY}) WITH ORDINALITY AS u(p, o)
    WHERE p IS NOT NULL AND regexp_replace(p, '\\D', '', 'g') <> coalesce(regexp_replace(${MOBILE_SQL}, '\\D', '', 'g'), '')
    ORDER BY o LIMIT 1)`;
const ANY_PHONE = `(${PHONE_COLS.map((k) => `NULLIF(btrim(c.${k}), '') IS NOT NULL`).join(' OR ')})`;

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
  const r = isDim(input.r) ? input.r : 'polo';
  let c = isDim(input.c) ? input.c : 'ano_escolar';
  if (c === r) c = r === 'ano_escolar' ? 'polo' : 'ano_escolar';

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

/*
 * Nome a mostrar de um grupo: a forma mais usada nos dados originais.
 * Se estiver toda em maiúsculas, passa a "Primeira Letra Grande".
 */
const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
function prettify(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t || t !== t.toUpperCase() || t === t.toLowerCase()) return t;
  return t.toLowerCase().split(' ').map((w, i) => (
    i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  )).join(' ');
}

/*
 * Agrupa por chave e escolhe o nome a mostrar de cada grupo. Preferência:
 * forma escrita por extenso (sem abreviaturas), com acentos, não toda em
 * maiúsculas, e depois a mais usada. Ex.: "Vila Nova de Gaia" ganha a "V.N.Gaia".
 */
function groupedSql(dim, where, tail) {
  const raw = dim.raw || dim.expr;
  const full = dim.raw ? normKey(dim.raw, false) : dim.expr;
  return `SELECT v, sum(n)::int AS n,
            (array_agg(t ORDER BY (nk = v) DESC, (t ~ '[^ -~]') DESC, (t <> upper(t)) DESC, n DESC))[1] AS label,
            json_agg(json_build_object('t', t, 'n', n) ORDER BY n DESC) AS variants
       FROM (SELECT coalesce(${dim.expr}, '${EMPTY}') AS v, coalesce(NULLIF(btrim(${raw}), ''), '(vazio)') AS t,
                    coalesce(${full}, '${EMPTY}') AS nk, count(*)::int AS n
               FROM contacts c WHERE ${where} GROUP BY 1, 2, 3) x
      GROUP BY v ORDER BY 2 DESC, 1 ${tail}`;
}

/* Lista de valores mais frequentes num eixo (vazio conta como valor). */
async function topValues(pool, dim, where, params, limit) {
  const { rows } = await pool.query(groupedSql(dim, where, `LIMIT ${limit + 1}`), params);
  return rows;
}

/*
 * Todos os grupos de um eixo, com as formas escritas que foram juntadas.
 * Serve a página "Ver grupos e Outros" (para conferir as junções).
 */
async function allGroups(pool, dimKey, crit) {
  const dim = DIMENSIONS[dimKey];
  const params = [];
  const where = baseWhere(crit, params).join(' AND ');
  const { rows } = await pool.query(groupedSql(dim, where, 'LIMIT 3000'), params);
  return rows.map((r) => ({
    v: r.v,
    n: r.n,
    label: r.v === EMPTY ? '(vazio)' : prettify(r.label),
    variants: r.variants,
  }));
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
    topValues(pool, DIMENSIONS[crit.r], where, params, TOP_ROWS),
    topValues(pool, DIMENSIONS[crit.c], where, params, TOP_COLS),
  ]);
  const labels = {};
  [...rRows, ...cRows].forEach((x) => { if (x.label && x.v !== EMPTY) labels[x.v] = prettify(x.label); });
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
  return { rowsAxis, colsAxis, counts, total, rTop, cTop, labels };
}

function valueLabel(v, labels) {
  if (v === EMPTY) return '(vazio)';
  if (v === OTHERS) return 'Outros';
  if (labels && labels[v]) return labels[v];
  return v;
}

/* Nome legível a partir da chave (quando não há o nome original à mão). */
function keyTitle(v) {
  if (v === EMPTY || v === OTHERS) return valueLabel(v);
  return String(v).split(' ').map((w, i) => (
    i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  )).join(' ');
}

/* Texto curto para descrever uma seleção (usado no nome e na lista de lotes). */
function describe(crit) {
  const cells = crit.cells.map((x) => `${keyTitle(x.r)} · ${keyTitle(x.c)}`);
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
  allGroups,
  PHONE_COLS,
  PHONES_SQL,
  ANY_PHONE,
  MOBILE_SQL,
  OTHER_PHONE_SQL,
  prettify,
  normKey,
};

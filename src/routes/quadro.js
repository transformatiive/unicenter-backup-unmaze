const express = require('express');
const { pool } = require('../db');
const seg = require('../lib/segment');
const cache = require('../lib/cache');

const router = express.Router();

async function listTags() {
  return cache.remember('tags', 60, async () => {
    const { rows } = await pool.query('SELECT id, name, color FROM tags ORDER BY name');
    return rows;
  });
}

async function listCampaigns() {
  return cache.remember('campaigns', 300, async () => {
    const { rows } = await pool.query(
      `SELECT ${seg.DIMENSIONS.campanha.expr} AS v, count(*)::int AS n
         FROM contacts c WHERE c.deleted_at IS NULL AND ${seg.DIMENSIONS.campanha.expr} IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 100`,
    );
    return rows;
  });
}

router.get('/', async (req, res, next) => {
  try {
    const crit = seg.parseCriteria(req.query);
    const key = `matrix:${JSON.stringify([crit.r, crit.c, crit.camp, crit.tag, crit.aut, crit.excl])}`;
    const [matrix, tags, campaigns, allTotal] = await Promise.all([
      cache.remember(key, 60, () => seg.buildMatrix(pool, crit)),
      listTags(),
      listCampaigns(),
      cache.remember('allTotal', 300, async () => {
        const { rows } = await pool.query('SELECT count(*)::int AS n FROM contacts WHERE deleted_at IS NULL');
        return rows[0].n;
      }),
    ]);
    res.render('quadro/index', {
      crit,
      allTotal,
      matrix,
      tags,
      campaigns,
      dims: seg.DIMENSIONS,
      EMPTY: seg.EMPTY,
      OTHERS: seg.OTHERS,
      valueLabel: (v) => seg.valueLabel(v, matrix.labels),
      qs: new URLSearchParams({ r: crit.r, c: crit.c, camp: crit.camp, tag: crit.tag || '', aut: crit.aut ? '1' : '0', excl: crit.excl ? '1' : '0' }).toString(),
      msg: typeof req.query.msg === 'string' ? req.query.msg : null,
    });
  } catch (err) {
    next(err);
  }
});

/*
 * Todos os grupos de um eixo (linhas ou colunas), incluindo os que ficam em
 * "Outros", com as formas escritas que foram juntadas em cada grupo.
 */
router.get('/grupos', async (req, res, next) => {
  try {
    const crit = seg.parseCriteria(req.query);
    const d = req.query.d === 'c' ? crit.c : crit.r;
    const key = `groups:${JSON.stringify([d, crit.r, crit.c, crit.camp, crit.tag, crit.aut, crit.excl])}`;
    const [groups, matrix] = await Promise.all([
      cache.remember(key, 60, () => seg.allGroups(pool, d, crit)),
      cache.remember(`matrix:${JSON.stringify([crit.r, crit.c, crit.camp, crit.tag, crit.aut, crit.excl])}`, 60, () => seg.buildMatrix(pool, crit)),
    ]);
    const top = new Set(d === crit.r ? matrix.rTop : matrix.cTop);
    const total = groups.reduce((a, g) => a + g.n, 0);
    return res.render('quadro/grupos', {
      groups, top, total, dim: seg.DIMENSIONS[d], crit,
      back: `/quadro?${new URLSearchParams({ r: crit.r, c: crit.c, camp: crit.camp, tag: crit.tag || '', aut: crit.aut ? '1' : '0', excl: crit.excl ? '1' : '0' })}`,
    });
  } catch (err) {
    return next(err);
  }
});

/* Resumo da seleção: total e qualidade dos dados de contacto. */
router.post('/contar', async (req, res, next) => {
  try {
    const crit = seg.parseCriteria(req.body);
    const params = [];
    const where = seg.selectionWhere(crit, params);
    if (!where) return res.json({ count: 0 });
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count,
              count(*) FILTER (WHERE ${seg.ANY_EMAIL})::int AS email,
              count(*) FILTER (WHERE ${seg.ANY_PHONE})::int AS tel,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id))::int AS tagged
         FROM contacts c WHERE ${where}`,
      params,
    );
    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

/* Etiquetar todos os contactos da seleção (nunca retira nem apaga nada). */
router.post('/etiquetar', async (req, res, next) => {
  try {
    const crit = seg.parseCriteria(req.body.crit || {});
    const params = [];
    const where = seg.selectionWhere(crit, params);
    if (!where) return res.status(400).json({ error: 'Escolha pelo menos um grupo no quadro.' });

    let tagId = parseInt(req.body.tagId, 10) || null;
    const newName = typeof req.body.tagName === 'string' ? req.body.tagName.trim().slice(0, 80) : '';
    if (!tagId && newName) {
      const { rows } = await pool.query(
        `INSERT INTO tags (name, created_by) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [newName, req.session.user.id],
      );
      tagId = rows[0].id;
    }
    if (!tagId) return res.status(400).json({ error: 'Escolha ou escreva uma etiqueta.' });

    params.push(tagId);
    const t = params.length;
    params.push(req.session.user.id);
    const u = params.length;
    const result = await pool.query(
      `INSERT INTO contact_tags (contact_id, tag_id, created_by)
       SELECT c.id, $${t}, $${u} FROM contacts c WHERE ${where}
       ON CONFLICT DO NOTHING`,
      params,
    );
    await pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
      req.session.user.id, 'tag_bulk', JSON.stringify({ tagId, added: result.rowCount, criteria: crit }),
    ]);
    cache.clear();
    return res.json({ added: result.rowCount, tagId });
  } catch (err) {
    return next(err);
  }
});

/* Lista dos contactos da seleção (critérios codificados no endereço). */
router.get('/contactos', async (req, res, next) => {
  try {
    let raw = {};
    try {
      raw = JSON.parse(Buffer.from(String(req.query.s || ''), 'base64url').toString('utf8'));
    } catch (e) {
      raw = {};
    }
    const crit = seg.parseCriteria(raw);
    const params = [];
    const where = seg.selectionWhere(crit, params);
    if (!where) return res.redirect('/quadro');
    const pageSize = 100;
    const { rows: cnt } = await pool.query(`SELECT count(*)::int AS n FROM contacts c WHERE ${where}`, params);
    const total = cnt[0].n;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.nome_de_encarregado_d, c.escola, c.localidade, c.ano_escolar, c.campanha_actual,
              ${seg.PHONES_SQL} AS telefones, ${seg.EMAILS_SQL} AS email,
              (SELECT string_agg(t.name, ', ' ORDER BY t.name) FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = c.id) AS tags
         FROM contacts c WHERE ${where}
        ORDER BY c.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    return res.render('quadro/contactos', {
      rows, total, page, totalPages, s: String(req.query.s), title: seg.describe(crit),
      back: `/quadro?${new URLSearchParams({ r: crit.r, c: crit.c, camp: crit.camp, tag: crit.tag || '', aut: crit.aut ? '1' : '0', excl: crit.excl ? '1' : '0' })}`,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

const express = require('express');
const { pool } = require('../db');
const seg = require('../lib/segment');
const cache = require('../lib/cache');
const { PRESETS, EXCEL_MAX_ROWS, streamBatch } = require('../lib/export');

const router = express.Router();

const STATUS = {
  criado: { label: 'Criado', cls: 'n' },
  descarregado: { label: 'Descarregado', cls: 'a' },
  importado_bigin: { label: 'Importado no Bigin', cls: 'g' },
};

function audit(userId, action, details) {
  return pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
    userId, action, JSON.stringify(details),
  ]);
}

/*
 * Cria um lote a partir de um WHERE já construído com parâmetros.
 * Tudo numa transação: ou fica o lote inteiro, ou não fica nada.
 */
async function createBatch({ name, criteria, where, params, tagIt, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO export_batches (name, criteria, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name, JSON.stringify(criteria), userId],
    );
    const id = rows[0].id;
    const p = params.slice();
    p.push(id);
    const ins = await client.query(
      `INSERT INTO export_batch_contacts (batch_id, contact_id)
       SELECT $${p.length}, c.id FROM contacts c WHERE ${where}
       ON CONFLICT DO NOTHING`,
      p,
    );
    if (ins.rowCount === 0) {
      await client.query('ROLLBACK');
      const err = new Error('Não há contactos para pôr neste lote.');
      err.status = 400;
      throw err;
    }
    await client.query('UPDATE export_batches SET contact_count = $1 WHERE id = $2', [ins.rowCount, id]);
    if (tagIt) {
      const tagName = `Lote ${id}: ${name}`.slice(0, 80);
      const t = await client.query(
        `INSERT INTO tags (name, color, created_by) VALUES ($1, '#B07F2A', $2)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [tagName, userId],
      );
      await client.query(
        `INSERT INTO contact_tags (contact_id, tag_id, created_by)
         SELECT contact_id, $1, $2 FROM export_batch_contacts WHERE batch_id = $3
         ON CONFLICT DO NOTHING`,
        [t.rows[0].id, userId, id],
      );
    }
    await client.query(
      'INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)',
      [userId, 'batch_created', JSON.stringify({ batchId: id, count: ins.rowCount, criteria })],
    );
    await client.query('COMMIT');
    cache.clear();
    return { id, count: ins.rowCount };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.name, b.criteria, b.contact_count, b.status, b.created_at, u.username
         FROM export_batches b LEFT JOIN users u ON u.id = b.created_by
        ORDER BY b.id DESC LIMIT 500`,
    );
    res.render('lotes/index', { batches: rows, STATUS });
  } catch (err) {
    next(err);
  }
});

/* Lote a partir do quadro cruzado (JSON). */
router.post('/quadro', async (req, res, next) => {
  try {
    const crit = seg.parseCriteria(req.body.crit || {});
    const params = [];
    const where = seg.selectionWhere(crit, params);
    if (!where) return res.status(400).json({ error: 'Escolha pelo menos um grupo no quadro.' });
    const name = String(req.body.name || '').trim().slice(0, 120) || 'Lote sem nome';
    const out = await createBatch({
      name,
      criteria: { origem: 'quadro', descricao: seg.describe(crit), ...crit },
      where,
      params,
      tagIt: !!req.body.tagIt,
      userId: req.session.user.id,
    });
    return res.json(out);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
});

/* Lote a partir da lista de contactos (selecionados ou pesquisa). */
router.post('/pesquisa', async (req, res, next) => {
  try {
    // eslint-disable-next-line global-require
    const { buildWhereClause } = require('./contacts');
    const ids = String(req.body.ids || '').split(',').map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v));
    let where;
    let params;
    let descricao;
    if (ids.length) {
      params = [ids];
      where = 'c.deleted_at IS NULL AND c.id = ANY($1::int[])';
      descricao = `${ids.length} contactos escolhidos à mão`;
    } else {
      const built = buildWhereClause(req.body);
      where = built.where;
      params = built.values;
      descricao = req.body.q ? `Pesquisa: "${String(req.body.q).slice(0, 80)}"` : 'Todos os contactos';
    }
    const name = String(req.body.name || '').trim().slice(0, 120) || descricao;
    const out = await createBatch({
      name,
      criteria: { origem: 'pesquisa', descricao, q: req.body.q || '', field: req.body.field || '', ids: ids.length },
      where,
      params,
      tagIt: false,
      userId: req.session.user.id,
    });
    return res.redirect(`/lotes/${out.id}?novo=1`);
  } catch (err) {
    if (err.status) return res.status(err.status).render('error', { message: err.message });
    return next(err);
  }
});

async function loadBatch(id) {
  const { rows } = await pool.query(
    `SELECT b.*, u.username FROM export_batches b LEFT JOIN users u ON u.id = b.created_by WHERE b.id = $1`,
    [parseInt(id, 10) || 0],
  );
  return rows[0];
}

router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const batch = await loadBatch(req.params.id);
    if (!batch) return res.status(404).render('error', { message: 'Lote não encontrado.' });
    const presets = Object.entries(PRESETS)
      .filter(([, p]) => !p.admin || req.session.user.is_admin)
      .map(([key, p]) => ({ key, label: p.label }));
    return res.render('lotes/detail', {
      batch, STATUS, presets, EXCEL_MAX_ROWS, novo: req.query.novo === '1',
      error: typeof req.query.erro === 'string' ? req.query.erro : null,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id(\\d+)/contactos', async (req, res, next) => {
  try {
    const batch = await loadBatch(req.params.id);
    if (!batch) return res.status(404).render('error', { message: 'Lote não encontrado.' });
    const pageSize = 100;
    const totalPages = Math.max(1, Math.ceil(batch.contact_count / pageSize));
    const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.nome_de_encarregado_d, c.escola, c.localidade, c.ano_escolar,
              ${seg.PHONES_SQL} AS telefones, ${seg.EMAILS_SQL} AS email,
              (SELECT string_agg(t.name, ', ' ORDER BY t.name) FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = c.id) AS tags
         FROM export_batch_contacts b JOIN contacts c ON c.id = b.contact_id
        WHERE b.batch_id = $1
        ORDER BY c.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      [batch.id],
    );
    return res.render('lotes/contactos', { batch, rows, page, totalPages });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id(\\d+)/descarregar', async (req, res, next) => {
  const batch = await loadBatch(req.params.id).catch(() => null);
  if (!batch) return res.status(404).render('error', { message: 'Lote não encontrado.' });
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const preset = PRESETS[req.query.preset] ? req.query.preset : 'bigin';
  if (PRESETS[preset].admin && !req.session.user.is_admin) {
    return res.status(403).render('error', { message: 'Só um administrador pode exportar dados sensíveis.' });
  }
  if (format === 'xlsx' && batch.contact_count > EXCEL_MAX_ROWS) {
    return res.redirect(`/lotes/${batch.id}?erro=${encodeURIComponent(`O Excel aceita até ${EXCEL_MAX_ROWS.toLocaleString('pt-PT')} linhas. Use CSV para este lote.`)}`);
  }
  try {
    await audit(req.session.user.id, 'export', { batchId: batch.id, format, preset, count: batch.contact_count });
    if (batch.status === 'criado') {
      await pool.query("UPDATE export_batches SET status = 'descarregado', updated_at = now() WHERE id = $1", [batch.id]);
    }
    const filename = `lote_${batch.id}_${preset}_${new Date().toISOString().slice(0, 10)}`;
    await streamBatch({ batchId: batch.id, preset, format, filename, userId: req.session.user.id, req, res });
    return undefined;
  } catch (err) {
    if (err.status === 429 && !res.headersSent) return res.status(429).render('error', { message: err.message });
    if (res.headersSent) {
      // eslint-disable-next-line no-console
      console.error('[export] interrompido', { batchId: batch.id, code: err.code });
      return res.destroy();
    }
    return next(err);
  }
});

router.post('/:id(\\d+)/estado', async (req, res, next) => {
  try {
    const status = STATUS[req.body.status] ? req.body.status : null;
    if (!status) return res.redirect(`/lotes/${req.params.id}`);
    await pool.query('UPDATE export_batches SET status = $1, updated_at = now() WHERE id = $2', [status, parseInt(req.params.id, 10)]);
    await audit(req.session.user.id, 'batch_status', { batchId: parseInt(req.params.id, 10), status });
    return res.redirect(`/lotes/${req.params.id}`);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

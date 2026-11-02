const express = require('express');
const { pool } = require('../db');
const cache = require('../lib/cache');

const router = express.Router();

const COLORS = ['#0F6468', '#B07F2A', '#2563EB', '#7C3AED', '#DB2777', '#16A34A', '#EA580C', '#475569'];

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.color, t.created_at, u.username,
              (SELECT count(*)::int FROM contact_tags ct WHERE ct.tag_id = t.id) AS n
         FROM tags t LEFT JOIN users u ON u.id = t.created_by
        ORDER BY t.name`,
    );
    res.render('etiquetas/index', {
      tags: rows, COLORS,
      error: typeof req.query.erro === 'string' ? req.query.erro : null,
      message: typeof req.query.msg === 'string' ? req.query.msg : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 80);
    const color = COLORS.includes(req.body.color) ? req.body.color : COLORS[0];
    if (!name) return res.redirect('/etiquetas?erro=Escreva um nome.');
    const r = await pool.query(
      'INSERT INTO tags (name, color, created_by) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
      [name, color, req.session.user.id],
    );
    if (!r.rowCount) return res.redirect('/etiquetas?erro=Já existe uma etiqueta com esse nome.');
    await pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
      req.session.user.id, 'tag_created', JSON.stringify({ name }),
    ]);
    cache.clear();
    return res.redirect('/etiquetas?msg=Etiqueta criada.');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const router = express.Router();

router.get('/users', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, active, is_admin, must_change_password, created_at, updated_at FROM users ORDER BY username',
  );
  res.render('admin/users', { users: rows, error: null, message: req.query.msg || null });
});

router.post('/users', async (req, res) => {
  const { username, password, is_admin: isAdmin } = req.body;
  if (!username || !password) {
    const { rows } = await pool.query(
      'SELECT id, username, active, is_admin, must_change_password, created_at, updated_at FROM users ORDER BY username',
    );
    return res.render('admin/users', { users: rows, error: 'Utilizador e password são obrigatórios.', message: null });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'INSERT INTO users (username, password_hash, is_admin, must_change_password) VALUES ($1, $2, $3, TRUE)',
      [username.trim(), hash, !!isAdmin],
    );
    await pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
      req.session.user.id,
      'user_created',
      JSON.stringify({ username }),
    ]);
    return res.redirect('/admin/users?msg=Utilizador criado com sucesso.');
  } catch (err) {
    const { rows } = await pool.query(
      'SELECT id, username, active, is_admin, must_change_password, created_at, updated_at FROM users ORDER BY username',
    );
    const error = err.code === '23505' ? 'Já existe um utilizador com esse nome.' : 'Erro ao criar utilizador.';
    return res.render('admin/users', { users: rows, error, message: null });
  }
});

router.post('/users/:id/toggle-active', async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.session.user.id) {
    return res.redirect('/admin/users?msg=Não podes desativar a tua própria conta.');
  }
  const { rows } = await pool.query('SELECT active, username FROM users WHERE id = $1', [id]);
  if (!rows[0]) return res.redirect('/admin/users');
  const newActive = !rows[0].active;
  await pool.query('UPDATE users SET active = $1, updated_at = now() WHERE id = $2', [newActive, id]);
  await pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
    req.session.user.id,
    newActive ? 'user_activated' : 'user_deactivated',
    JSON.stringify({ target_user_id: Number(id), username: rows[0].username }),
  ]);
  return res.redirect(`/admin/users?msg=Utilizador ${newActive ? 'ativado' : 'desativado'} com sucesso.`);
});

router.post('/users/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const { new_password: newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.redirect('/admin/users?msg=A nova password deve ter pelo menos 8 caracteres.');
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    'UPDATE users SET password_hash = $1, must_change_password = TRUE, updated_at = now() WHERE id = $2',
    [hash, id],
  );
  await pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
    req.session.user.id,
    'user_password_reset',
    JSON.stringify({ target_user_id: Number(id) }),
  ]);
  return res.redirect('/admin/users?msg=Password redefinida. O utilizador terá de a alterar no próximo login.');
});

module.exports = router;

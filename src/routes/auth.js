const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/quadro');
  return res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Preenche utilizador e password.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    const user = rows[0];

    if (!user) {
      await pool.query(
        'INSERT INTO audit_log (action, details) VALUES ($1, $2)',
        ['login_failed', JSON.stringify({ username })],
      );
      return res.render('login', { error: 'Credenciais inválidas.' });
    }

    if (!user.active) {
      return res.render('login', { error: 'Esta conta está desativada. Contacta um administrador.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await pool.query(
        'INSERT INTO audit_log (user_id, action) VALUES ($1, $2)',
        [user.id, 'login_failed'],
      );
      return res.render('login', { error: 'Credenciais inválidas.' });
    }

    req.session.regenerate(async (err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return res.render('login', { error: 'Erro ao iniciar sessão. Tenta novamente.' });
      }
      req.session.user = {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        must_change_password: user.must_change_password,
      };
      await pool.query('INSERT INTO audit_log (user_id, action) VALUES ($1, $2)', [user.id, 'login']);

      const dest = req.session.returnTo || '/quadro';
      delete req.session.returnTo;

      if (user.must_change_password) {
        return res.redirect('/change-password');
      }
      return res.redirect(dest);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.render('login', { error: 'Erro ao contactar a base de dados.' });
  }
});

router.get('/change-password', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  return res.render('change_password', { error: null, message: null });
});

router.post('/change-password', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.render('change_password', { error: 'Preenche todos os campos.', message: null });
  }
  if (newPassword !== confirmPassword) {
    return res.render('change_password', { error: 'A nova password e a confirmação não coincidem.', message: null });
  }
  if (newPassword.length < 8) {
    return res.render('change_password', { error: 'A nova password deve ter pelo menos 8 caracteres.', message: null });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.user.id]);
    const user = rows[0];
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.render('change_password', { error: 'Password atual incorreta.', message: null });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2',
      [hash, user.id],
    );
    req.session.user.must_change_password = false;
    await pool.query('INSERT INTO audit_log (user_id, action) VALUES ($1, $2)', [user.id, 'password_changed']);
    return res.render('change_password', { error: null, message: 'Password alterada com sucesso.' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.render('change_password', { error: 'Erro ao alterar a password.', message: null });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;

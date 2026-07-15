/*
 * Cria (ou atualiza a password de) o utilizador inicial da aplicação.
 * Usar apenas uma vez, após correr as migrações. Lê credenciais de env vars
 * SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD (ver .env.example).
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || 'jdias';
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    throw new Error('Define SEED_ADMIN_PASSWORD antes de correr este script.');
  }

  const hash = await bcrypt.hash(password, 12);

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);

  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE users SET password_hash = $1, active = TRUE, is_admin = TRUE, updated_at = now() WHERE username = $2',
      [hash, username],
    );
    // eslint-disable-next-line no-console
    console.log(`[seed_admin] utilizador '${username}' já existia — password/estado atualizados.`);
  } else {
    await pool.query(
      'INSERT INTO users (username, password_hash, active, is_admin) VALUES ($1, $2, TRUE, TRUE)',
      [username, hash],
    );
    // eslint-disable-next-line no-console
    console.log(`[seed_admin] utilizador '${username}' criado com sucesso.`);
  }

  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed_admin] falhou:', err);
  process.exit(1);
});

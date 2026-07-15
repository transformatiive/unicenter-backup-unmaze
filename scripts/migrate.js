/*
 * Corre todos os ficheiros .sql da pasta migrations/, por ordem alfabética,
 * dentro de uma transação por ficheiro. Idempotente (usa CREATE TABLE IF NOT EXISTS).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const client = await pool.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`[migrate] a aplicar ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        // eslint-disable-next-line no-console
        console.log(`[migrate] ${file} aplicado com sucesso`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] falhou:', err);
  process.exit(1);
});
